import unittest
from unittest.mock import patch

import server


class RouteParsingTests(unittest.TestCase):
    def test_numeric_codes_and_dates_after_code(self):
        rows = [
            ["01/11/2026", "TÉCNICA", "CÓDIGO", "02/11/2026", "03/11/2026"],
            ["X", "PREDITIVA", 1.0, "X", None],
            [None, "PREDITIVA", 2.0, None, "X"],
            [None, "PREDITIVA", 1.0, None, "x"],
            [None, "CHECK LIST", 1.0, "X", None],
        ]
        with patch.object(server, "xlsx_rows", return_value=rows):
            records = server.parse_conf_routes(b"workbook")
        self.assertEqual(records, [
            {"code": "1", "technique": "PREDITIVA", "tag": "", "orderType": "", "dates": ["2026-11-02", "2026-11-03"]},
            {"code": "2", "technique": "PREDITIVA", "tag": "", "orderType": "", "dates": ["2026-11-03"]},
            {"code": "1", "technique": "CHECK LIST", "tag": "", "orderType": "", "dates": ["2026-11-02"]},
        ])

    def test_missing_header_or_row_code_is_rejected(self):
        with patch.object(server, "xlsx_rows", return_value=[["PC", "TÉCNICA", "02/11/2026"]]):
            with self.assertRaisesRegex(ValueError, "CÓDIGO e TÉCNICA"):
                server.parse_conf_routes(b"workbook")
        rows = [["CÓDIGO", "TÉCNICA", "02/11/2026"], [None, "PREDITIVA", "X"]]
        with patch.object(server, "xlsx_rows", return_value=rows):
            with self.assertRaisesRegex(ValueError, "linha 2.*CÓDIGO"):
                server.parse_conf_routes(b"workbook")

    def test_dates_must_follow_code(self):
        rows = [["02/11/2026", "CÓDIGO", "TÉCNICA"], ["X", 1.0, "PREDITIVA"]]
        with patch.object(server, "xlsx_rows", return_value=rows):
            with self.assertRaisesRegex(ValueError, "datas após a coluna CÓDIGO"):
                server.parse_conf_routes(b"workbook")

    def test_code_technique_keep_separate_tags_and_order_types(self):
        rows = [
            ["TIPO", "TÉCNICA", "TAG", "CÓDIGO", "02/11/2026"],
            ["YBA9", "CHECK LIST", "TAG-A", 1.0, "X"],
            ["YB20", "CHECK LIST", "TAG-A", 1.0, "X"],
            ["YBA9", "CHECK LIST", "TAG-B", 1.0, "X"],
        ]
        with patch.object(server, "xlsx_rows", return_value=rows):
            records = server.parse_conf_routes(b"workbook")
        self.assertEqual([(r["tag"], r["orderType"]) for r in records], [
            ("TAG-A", "YBA9"), ("TAG-A", "YB20"), ("TAG-B", "YBA9")
        ])


if __name__ == "__main__":
    unittest.main()
