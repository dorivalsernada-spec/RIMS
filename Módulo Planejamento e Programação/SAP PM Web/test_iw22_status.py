import http.client
import json
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class Iw22StatusTests(unittest.TestCase):
    def test_first_run_creates_an_admin_without_reprompting(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(
                server, "AUTH_DB", Path(directory) / "auth.sqlite3"
            ), patch(
                "builtins.input", side_effect=["x", "setup-admin"]
            ) as prompt, patch.object(
                server.getpass,
                "getpass",
                side_effect=["short", "setup-password-2026", "setup-password-2026"],
            ), patch("builtins.print"):
                server.setup_initial_admin()
                server.setup_initial_admin()
                with server.auth_connection() as database:
                    user = database.execute(
                        "SELECT password_salt, password_hash, is_admin FROM users"
                    ).fetchone()
                self.assertEqual(prompt.call_count, 2)
                self.assertTrue(user["is_admin"])
                self.assertTrue(server.verify_password(
                    "setup-password-2026",
                    user["password_salt"],
                    user["password_hash"],
                ))

    @classmethod
    def setUpClass(cls):
        cls.auth_dir = tempfile.TemporaryDirectory()
        cls.auth_db_patch = patch.object(
            server, "AUTH_DB", Path(cls.auth_dir.name) / "auth.sqlite3"
        )
        cls.auth_db_patch.start()
        server.initialize_auth_store()
        server.create_auth_user(
            "test-admin",
            "Test Admin",
            "test-password-long-enough",
            "9999-12-31",
            True,
            True,
        )
        cls.session = server.issue_session("test-admin")
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.port_patch = patch.object(server, "PORT", cls.port)
        cls.port_patch.start()
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join()
        cls.httpd.server_close()
        cls.port_patch.stop()
        with server.SESSION_LOCK:
            server.SESSIONS.pop(cls.session, None)
        cls.auth_db_patch.stop()
        cls.auth_dir.cleanup()

    def post(self, payload):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(
                "POST",
                "/api/iw22/status",
                json.dumps(payload),
                {
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{self.port}",
                    "Cookie": f"{server.SESSION_COOKIE}={self.session}",
                },
            )
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_login_session_and_protected_routes(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request("GET", "/login")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertIn("text/html", response.getheader("Content-Type"))
            response.read()

            connection.request("GET", "/background.png")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader("Content-Type"), "image/png")
            response.read()

            connection.request("GET", "/")
            response = connection.getresponse()
            self.assertEqual(response.status, 303)
            self.assertEqual(response.getheader("Location"), "/login")
            response.read()

            connection.request("GET", "/paradas/")
            response = connection.getresponse()
            self.assertEqual(response.status, 303)
            self.assertEqual(response.getheader("Location"), "/login")
            response.read()

            connection.request("GET", "/api/auth/status")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertFalse(json.loads(response.read())["authenticated"])

            body = json.dumps({
                "username": "test-admin",
                "password": "test-password-long-enough",
            })
            connection.request(
                "POST",
                "/api/auth/login",
                body,
                {
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{self.port}",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            cookie = response.getheader("Set-Cookie")
            self.assertIn("HttpOnly", cookie)
            self.assertTrue(json.loads(response.read())["isAdmin"])

            connection.request(
                "GET",
                "/paradas/",
                headers={"Cookie": cookie.split(";", 1)[0]},
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertIn("text/html", response.getheader("Content-Type"))
            self.assertIn("Manutenção Entressafra", response.read().decode("utf-8"))
        finally:
            connection.close()

    def test_admin_can_migrate_legacy_users_without_storing_plaintext(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            payload = {
                "users": [{
                    "fullName": "Usuário antigo",
                    "username": "usuário antigo",
                    "password": "senha-antiga",
                    "validity": "9999-12-31",
                    "status": "Habilitado",
                    "isAdmin": False,
                }]
            }
            connection.request(
                "POST",
                "/api/auth/migrate",
                json.dumps(payload),
                {
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{self.port}",
                    "Cookie": f"{server.SESSION_COOKIE}={self.session}",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.read())["imported"], 1)

            with server.auth_connection() as database:
                row = database.execute(
                    "SELECT password_hash FROM users WHERE username = ?",
                    ("usuário antigo",),
                ).fetchone()
            self.assertNotEqual(row["password_hash"], b"senha-antiga")
        finally:
            connection.close()

    def test_admin_created_user_can_access_modules_but_not_admin_api(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(
                "POST",
                "/api/auth/users",
                json.dumps({
                    "action": "create",
                    "fullName": "Usuário comum",
                    "username": "usuario_comum",
                    "password": "senha-forte-para-teste",
                    "validity": "9999-12-31",
                    "status": "Habilitado",
                }),
                {
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{self.port}",
                    "Cookie": f"{server.SESSION_COOKIE}={self.session}",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 201)
            response.read()

            connection.request(
                "POST",
                "/api/auth/login",
                json.dumps({
                    "username": "usuario_comum",
                    "password": "senha-forte-para-teste",
                }),
                {
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{self.port}",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertFalse(json.loads(response.read())["isAdmin"])
            cookie = response.getheader("Set-Cookie").split(";", 1)[0]

            connection.request("GET", "/paradas/", headers={"Cookie": cookie})
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            response.read()

            connection.request("GET", "/api/auth/users", headers={"Cookie": cookie})
            response = connection.getresponse()
            self.assertEqual(response.status, 403)
            response.read()
        finally:
            connection.close()

    def test_protected_api_rejects_missing_session(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            body = json.dumps({"source": "iw28", "id": "test", "action": "close"})
            connection.request(
                "POST",
                "/api/iw22/status",
                body,
                {
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{self.port}",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 401)
            response.read()
        finally:
            connection.close()

    def test_selected_note_and_action_are_used_for_both_operations(self):
        export = (None, None, [{"id": "iw28-1", "note": "10132515"}])
        with patch.object(server, "parse_export", return_value=export), \
             patch.object(server, "execute_iw22_status", return_value="Confirmado") as execute:
            for action in ("close", "reopen"):
                status, result = self.post({"source": "iw28", "id": "iw28-1", "action": action})
                self.assertEqual(status, 200)
                self.assertEqual(result["sapMessage"], "Confirmado")
                execute.assert_called_with("10132515", action)

    def test_invalid_requests_never_run_sap(self):
        with patch.object(server, "execute_iw22_status") as execute:
            for payload in (
                {"source": "notas", "id": "iw28-1", "action": "close"},
                {"source": "iw28", "id": "iw28-1", "action": "invalid"},
                {"source": "iw28", "id": 1, "action": "close"},
                {"source": "iw28", "id": "iw28-1", "action": "close", "note": "123"},
            ):
                status, _ = self.post(payload)
                self.assertEqual(status, 400)
            execute.assert_not_called()

    def test_missing_and_invalid_notes_never_run_sap(self):
        with patch.object(server, "parse_export", return_value=(None, None, [{"id": "bad", "note": "abc"}])), \
             patch.object(server, "execute_iw22_status") as execute:
            self.assertEqual(self.post({"source": "iw28", "id": "missing", "action": "close"})[0], 404)
            self.assertEqual(self.post({"source": "iw28", "id": "bad", "action": "close"})[0], 400)
            execute.assert_not_called()

    def test_sap_failure_and_lock_conflict_are_reported(self):
        export = (None, None, [{"id": "iw28-1", "note": "10132515"}])
        with patch.object(server, "parse_export", return_value=export), \
             patch.object(server, "execute_iw22_status", side_effect=RuntimeError("Falha SAP")):
            status, result = self.post({"source": "iw28", "id": "iw28-1", "action": "close"})
            self.assertEqual(status, 502)
            self.assertIn("Falha SAP", result["message"])
        with server.SAP_WRITE_LOCK:
            status, _ = self.post({"source": "iw28", "id": "iw28-1", "action": "reopen"})
            self.assertEqual(status, 409)

    def test_script_result_and_timeout_are_checked(self):
        success = subprocess.CompletedProcess([], 0, stdout="Confirmado\n", stderr="")
        failure = subprocess.CompletedProcess([], 1, stdout="", stderr="Erro SAP")
        with patch.object(server.subprocess, "run", return_value=success) as run:
            self.assertEqual(server.execute_iw22_status("10132515", "reopen"), "Confirmado")
            self.assertEqual(run.call_args.args[0][-2:], ["10132515", "reopen"])
        with patch.object(server.subprocess, "run", return_value=failure):
            with self.assertRaisesRegex(RuntimeError, "Erro SAP"):
                server.execute_iw22_status("10132515", "close")
        with patch.object(server.subprocess, "run", side_effect=subprocess.TimeoutExpired("cscript", 120)):
            with self.assertRaisesRegex(RuntimeError, "excedeu 120 segundos"):
                server.execute_iw22_status("10132515", "close")


if __name__ == "__main__":
    unittest.main()
