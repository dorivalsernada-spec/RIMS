import http.client
import json
import subprocess
import threading
import unittest
from unittest.mock import patch

import server


class Iw22StatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
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

    def post(self, payload):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(
                "POST",
                "/api/iw22/status",
                json.dumps(payload),
                {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"},
            )
            response = connection.getresponse()
            return response.status, json.loads(response.read())
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
