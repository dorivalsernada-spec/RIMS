import tempfile
import unittest
from pathlib import Path

import server


class ItssInspectionTests(unittest.TestCase):
    def test_tab_export_status_and_multiline(self):
        text = (
            "Cabeçalho SAP\n\n\tNome (Matrícula)\tTipo ordem\tDescrição Atividade\tStatus\tMotivo\tData\n"
            "\tAna\tYBA9\tTAG-A_Inspeção\tS\t\t07.11.2026\n"
            "\tBruno\tYB20\tTAG-B_Outra\tN\tTexto\ncontinuado\t08.11.2026\n"
            "\tAna\tYBA9\tSEM SEPARADOR\tS\t\t07.11.2026\n"
        )
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "itss.txt"
            path.write_text(text, encoding="utf-8")
            records = server.parse_itss_inspections(path)
        self.assertEqual(records, [
            {"tag": "TAG-A", "status": "S", "date": "2026-11-07", "name": "Ana", "orderType": "YBA9"},
            {"tag": "TAG-B", "status": "N", "date": "2026-11-08", "name": "Bruno", "orderType": "YB20"},
        ])

    def test_missing_header_and_invalid_date_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "itss.txt"
            path.write_text("Inválido", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "colunas"):
                server.parse_itss_inspections(path)
            path.write_text(
                "\tNome (Matrícula)\tTipo ordem\tDescrição Atividade\tStatus\tData\n"
                "\tAna\tYBA9\tTAG_A\tS\tinválida\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "Data inválida"):
                server.parse_itss_inspections(path)


if __name__ == "__main__":
    unittest.main()
