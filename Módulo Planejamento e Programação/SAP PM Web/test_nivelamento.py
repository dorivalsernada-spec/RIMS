import unittest
from unittest.mock import patch

import server


class NivelamentoTests(unittest.TestCase):
    def test_daily_columns_include_zero_hours_and_employees_without_hours(self):
        rows = [
            ["FUNCIONÁRIOS", "CENTRO", 46342.0, 46343.0],
            ["Pessoa A", "CT_A", 8.8, None],
            ["Pessoa B", "CT_A", None, 0.0],
        ]
        with patch.object(server, "xlsx_rows", return_value=rows):
            entries = server.parse_nivelamento(b"planilha")
        self.assertEqual(len(entries), 4)
        self.assertEqual(entries[0], {"name": "Pessoa A", "workCenter": "CT_A", "date": "2026-11-16", "hh": 8.8})
        self.assertEqual(entries[3], {"name": "Pessoa B", "workCenter": "CT_A", "date": "2026-11-17", "hh": 0.0})

    def test_empty_availability_remains_an_error(self):
        rows = [["FUNCIONÁRIOS", "CENTRO", 46342.0], ["Pessoa A", "CT_A", None]]
        with patch.object(server, "xlsx_rows", return_value=rows):
            with self.assertRaisesRegex(ValueError, "não contém HH"):
                server.parse_nivelamento(b"planilha")

    def test_date_and_hours_format_remains_supported(self):
        rows = [
            ["Nome", "Centro", "Data", "Horas"],
            ["Pessoa A", "CT_A", "16.11.2026", "8,8"],
        ]
        with patch.object(server, "xlsx_rows", return_value=rows):
            entries = server.parse_nivelamento(b"planilha")
        self.assertEqual(entries, [{"name": "Pessoa A", "workCenter": "CT_A", "date": "2026-11-16", "hh": 8.8}])


if __name__ == "__main__":
    unittest.main()
