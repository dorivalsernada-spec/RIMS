import base64
import csv
import hashlib
import io
import json
import re
import subprocess
import threading
import unicodedata
import uuid
import zipfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765
SCRIPT = ROOT / "iw28.vbs"
IW22_SCRIPT = ROOT / "iw22.vbs"
IW22_STATUS_SCRIPT = ROOT / "iw22_status.vbs"
ITSS_SCRIPT = ROOT / "itss.vbs"
ITSS_FILE = ROOT.parent / "SAP GUI" / "ITSS_Rotas.txt"
ITSS_CLIENT = ROOT / "itss.js"
INDEX = ROOT / "index.html"
DASHBOARD = ROOT / "dashboard.html"
GANTT = ROOT / "gantt.html"
KANBAN = ROOT / "kanban.html"
NIVELAMENTO = ROOT / "nivelamento.html"
CONFIABILIDADE = ROOT / "confiabilidade.html"
BRAND_IMAGE = ROOT / "rims-one-logo.png"
SIDEBAR_SCRIPT = ROOT / "sidebar.js"
CONF_DIR = ROOT / "confiabilidade"
CONF_FILE = CONF_DIR / "pontos.json"
CONF_CODES_FILE = CONF_DIR / "codigos.json"
CONF_ROUTES_FILE = CONF_DIR / "rotas.json"
CONF_LOCK = threading.Lock()
CONF_IMAGE_MAX_BYTES = 15 * 1024 * 1024
CONF_AREAS = {
    "laboratorio-industrial": "Laboratório Industrial",
    "extracao-do-caldo": "Extração do Caldo",
    "suporte-industrial": "Suporte Industrial",
    "geracao-de-energia": "Geração de Energia",
    "residuo-industrial": "Resíduo Industrial",
    "fabricacao-de-acucar": "Fabricação de Açúcar",
    "fabricacao-de-etanol": "Fabricação de Etanol",
    "processamento-de-biomassa": "Processamento de Biomassa",
}
CONF_IMAGE_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
}
NIVELAMENTO_FILE = ROOT / "nivelamento.json"
NIVELAMENTO_MAX_BYTES = 10 * 1024 * 1024
NIVELAMENTO_LOCK = threading.Lock()
PLAN_FILE = ROOT / "planejamento.json"
DATA_SOURCES = {
    "iw28": (Path("SAP GUI") / "IW28.txt", "Exportação IW28"),
    "ordens": (Path("teste 1"), "Ordens SAP (teste 1)"),
    "notas": (Path("SAP GUI") / "TESTE.txt", "Notas SAP (TESTE.txt)"),
}
STATE_LOCK = threading.Lock()
STATE = {"state": "idle", "message": "Pronto para executar a rotina IW28."}
ITSS_STATE = {"state": "idle", "message": "Pronto para executar a rotina ITSS."}
PLAN_LOCK = threading.Lock()
SAP_WRITE_LOCK = threading.Lock()
SAP_PRIORITY_KEYS = {"Alta": "2", "Média": "3", "Baixa": "4"}
STATUS_CODES = {
    "MSEN": "ENC",
    "MSEN ORDA": "ENC",
    "MSPR ORDA": "AND",
    "MSIM MSPR ORDA": "ENC",
    "MSEN MSIM ORDA": "ENC",
    "MSPN": "PEN",
    "MEAB MSPR ORDA": "AND",
    "MSPR": "PEN",
}


def normalize_status(value):
    cleaned = " ".join(str(value or "").split()).upper()
    return STATUS_CODES.get(cleaned, cleaned)


def sap_date(value):
    if not value:
        return ""
    parsed = datetime.strptime(value, "%Y-%m-%d")
    return parsed.strftime("%d.%m.%Y")


def execute_iw22(note_number, updates, bulk=False):
    if not IW22_SCRIPT.is_file():
        raise RuntimeError(f"O script de atualização {IW22_SCRIPT.name} não foi encontrado.")

    priority_key = SAP_PRIORITY_KEYS.get(updates["priority"], "")
    arguments = [
        "cscript.exe",
        "//NoLogo",
        str(IW22_SCRIPT),
        note_number,
        updates["sapDescription"],
        sap_date(updates["desiredStart"]),
        sap_date(updates["desiredCompletion"]),
        priority_key,
        updates["shutdown"],
        updates["shutdownDuration"],
    ]
    if bulk:
        arguments.append("--bulk")
    try:
        result = subprocess.run(
            arguments,
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            "A execução SAP excedeu 120 segundos; verifique a nota no IW22 antes de tentar novamente."
        ) from error
    except OSError as error:
        raise RuntimeError(f"Não foi possível iniciar o scripting IW22: {error}") from error

    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        message = "O script IW22 terminou com falha."
        if details:
            message = f"{message} {details[-1000:]}"
        raise RuntimeError(message)
    sap_message = (result.stdout or "").strip()
    if not sap_message:
        raise RuntimeError(
            "O script IW22 terminou sem uma mensagem de sucesso do SAP; "
            "verifique a nota antes de tentar novamente."
        )
    return sap_message


def execute_iw22_status(note_number, action):
    if not IW22_STATUS_SCRIPT.is_file():
        raise RuntimeError(f"O script {IW22_STATUS_SCRIPT.name} não foi encontrado.")
    try:
        result = subprocess.run(
            ["cscript.exe", "//NoLogo", str(IW22_STATUS_SCRIPT), note_number, action],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            "A execução SAP excedeu 120 segundos; verifique a nota no IW22 antes de tentar novamente."
        ) from error
    except OSError as error:
        raise RuntimeError(f"Não foi possível iniciar o scripting IW22: {error}") from error
    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"O script IW22 terminou com falha. {details[-1000:]}")
    sap_message = (result.stdout or "").strip()
    if not sap_message:
        raise RuntimeError("O SAP não confirmou a alteração de status; verifique a nota no IW22.")
    return sap_message


def decode_export(path):
    content = path.read_bytes()
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Não foi possível reconhecer a codificação do arquivo {path.name}.")


def parse_date(value):
    value = value.strip()
    if not value:
        return ""
    try:
        return datetime.strptime(value, "%d.%m.%Y").date().isoformat()
    except ValueError:
        return value


def parse_export(source_id):
    relative_path, label = DATA_SOURCES[source_id]
    path = ROOT.parent / relative_path
    if not path.is_file():
        raise FileNotFoundError(f"Arquivo {path.name} não encontrado em {path.parent}.")

    lines = decode_export(path).splitlines()
    header_index = None
    headers = []
    for index, line in enumerate(lines):
        if "|" in line:
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        else:
            cells = [cell.strip() for cell in line.split("\t")]
        if "Nota" in cells and ("Ordem" in cells or "Descrição" in cells):
            header_index = index
            headers = cells
            break
    if header_index is None:
        raise ValueError(f"O arquivo {path.name} não contém um cabeçalho SAP reconhecido.")

    column_names = []
    seen_names = {}
    for index, header in enumerate(headers):
        base_name = header or f"Coluna {index + 1}"
        occurrence = seen_names.get(base_name, 0) + 1
        seen_names[base_name] = occurrence
        column_names.append(base_name if occurrence == 1 else f"{base_name} ({occurrence})")

    def value(cells, column):
        try:
            return cells[headers.index(column)].strip()
        except (ValueError, IndexError):
            return ""

    records = []
    duplicate_counts = {}
    for line in lines[header_index + 1:]:
        if "|" in line:
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        else:
            cells = [cell.strip() for cell in line.split("\t")]
        note = value(cells, "Nota")
        order = value(cells, "Ordem")
        description = (
            value(cells, "Descrição")
            or value(cells, "Texto breve")
            or value(cells, "Txt.breve operação")
        )
        text = value(cells, "Texto do item") or value(cells, "Texto breve") or value(cells, "Texto")
        equipment = value(cells, "Equipam.")
        installation = value(cells, "Local de instalação")
        if not any((note, order)) or not any((description, text, equipment, installation)):
            continue
        signature = "\x1f".join((note, order, equipment, installation, description, text))
        occurrence = duplicate_counts.get(signature, 0)
        duplicate_counts[signature] = occurrence + 1
        digest = hashlib.sha256(f"{signature}\x1f{occurrence}".encode("utf-8")).hexdigest()[:20]
        source_columns = {
            column_names[index]: cells[index].strip() if index < len(cells) else ""
            for index in range(len(column_names))
        }
        if "StatSist" in source_columns:
            source_columns["StatSist"] = normalize_status(source_columns["StatSist"])
        records.append({
            "id": f"{source_id}-{digest}",
            "sourceColumns": source_columns,
            "note": note,
            "order": order,
            "priority": value(cells, "Texto") if value(cells, "Texto") in ("Alta", "Média", "Baixa") else value(cells, "Prioridade") or value(cells, "P"),
            "executor": value(cells, "Denominação executor") or value(cells, "Recebedor"),
            "requiredDate": parse_date(value(cells, "Concl.desj") or value(cells, "Fim-base")),
            "plannedDate": "",
            "description": description,
            "text": text,
            "equipment": equipment,
            "technicalObject": value(cells, "Denominação do objeto técnico"),
            "installation": value(cells, "Denominação do loc.instalação") or installation,
            "status": normalize_status(value(cells, "Status sistema") or value(cells, "Status do sistema") or value(cells, "StatSist")),
        })

    if not records:
        raise ValueError(f"Nenhum registro de nota ou ordem foi encontrado em {path.name}.")
    return path, label, records


def load_plans():
    if not PLAN_FILE.exists():
        return {}
    try:
        value = json.loads(PLAN_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Não foi possível ler {PLAN_FILE.name}: {error}") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"O conteúdo de {PLAN_FILE.name} é inválido.")
    return value


def apply_plans(source_id, records, plans):
    source_plans = plans.get(source_id, {})
    if not isinstance(source_plans, dict):
        return records
    for record in records:
        updates = source_plans.get(record["id"], {})
        if isinstance(updates, dict):
            if "description" in updates and "planningDescription" not in updates:
                record["planningDescription"] = updates["description"]
                record.update({key: value for key, value in updates.items() if key != "description"})
            else:
                record.update(updates)
    return records


def save_plans(plans):
    temporary = PLAN_FILE.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(PLAN_FILE)


def validate_request_body(handler):
    if handler.headers.get("Origin") != f"http://{HOST}:{PORT}":
        raise ValueError("Origem da requisição inválida.")
    if handler.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
        raise ValueError("O formato da requisição deve ser JSON.")
    try:
        content_length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as error:
        raise ValueError("Tamanho da requisição inválido.") from error
    if content_length > 4096:
        raise ValueError("A requisição excede o tamanho permitido.")
    try:
        return json.loads(handler.rfile.read(content_length))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError("O corpo da requisição contém JSON inválido.") from error


def csv_export(records):
    output = io.StringIO(newline="")
    columns = [
        ("Nota", "note"),
        ("Ordem", "order"),
        ("Prioridade", "priority"),
        ("Executante", "executor"),
        ("Prazo planejado", "plannedDate"),
        ("Início desejado", "desiredStart"),
        ("Conclusão desejada", "desiredCompletion"),
        ("DuraçParada", "shutdownDuration"),
        ("Parada", "shutdown"),
        ("Descrição de planejamento", "planningDescription"),
        ("Descrição", "sapDescription"),
        ("Descrição SAP original", "description"),
        ("Texto SAP", "text"),
        ("Equipamento", "equipment"),
        ("Local de instalação", "installation"),
        ("Status sistema", "status"),
    ]
    writer = csv.writer(output, delimiter=";")
    writer.writerow([label for label, _ in columns])
    for record in records:
        values = dict(record)
        source_columns = record.get("sourceColumns", {})
        original_values = {
            "desiredStart": source_columns.get("Iníc.nec.", source_columns.get("Início desejado", "")),
            "desiredCompletion": source_columns.get("Concl.desj", source_columns.get("Conclusão Desejada", "")),
            "shutdownDuration": source_columns.get("DuraçParad", ""),
            "shutdown": source_columns.get("P", source_columns.get("Parada", "")),
            "sapDescription": source_columns.get("Descrição", ""),
        }
        for key, value in original_values.items():
            values.setdefault(key, value)
        writer.writerow([values.get(key, "") for _, key in columns])
    return output.getvalue().encode("utf-8-sig")


MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def column_index(reference):
    letters = re.match(r"[A-Z]+", reference or "")
    if not letters:
        return 0
    index = 0
    for char in letters.group(0):
        index = index * 26 + ord(char) - 64
    return index - 1


def xlsx_rows(data, sheet_hint=None):
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise ValueError("O arquivo não é uma planilha Excel (.xlsx) válida.") from error
    with archive:
        if sum(item.file_size for item in archive.infolist()) > 80 * 1024 * 1024:
            raise ValueError("A planilha excede o tamanho permitido.")
        names = set(archive.namelist())
        if "xl/workbook.xml" not in names:
            raise ValueError("O arquivo não é uma planilha Excel (.xlsx) válida.")
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(node.text or "" for node in item.iter(f"{MAIN_NS}t")) for item in root.findall(f"{MAIN_NS}si")]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = [(sheet.get("name", ""), sheet.get(f"{REL_NS}id")) for sheet in workbook.iter(f"{MAIN_NS}sheet")]
        if not sheets:
            raise ValueError("A planilha não possui abas.")
        targets = {}
        if "xl/_rels/workbook.xml.rels" in names:
            for rel in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels")).iter(f"{PKG_REL_NS}Relationship"):
                targets[rel.get("Id")] = rel.get("Target", "")
        chosen = (
            next((sheet for sheet in sheets if sheet_hint and sheet_hint in sheet[0].lower()), None)
            or next((sheet for sheet in sheets if "nivel" in sheet[0].lower()), sheets[0])
        )
        target = targets.get(chosen[1], "worksheets/sheet1.xml").lstrip("/")
        sheet_path = target if target.startswith("xl/") else f"xl/{target}"
        if sheet_path not in names:
            raise ValueError("Não foi possível localizar a aba da planilha.")
        rows = []
        for row in ET.fromstring(archive.read(sheet_path)).iter(f"{MAIN_NS}row"):
            if len(rows) >= 20000:
                break
            values = {}
            for cell in row.findall(f"{MAIN_NS}c"):
                position = column_index(cell.get("r"))
                if position > 500:
                    continue
                kind = cell.get("t")
                if kind == "inlineStr":
                    value = "".join(node.text or "" for node in cell.iter(f"{MAIN_NS}t"))
                else:
                    node = cell.find(f"{MAIN_NS}v")
                    value = node.text if node is not None and node.text is not None else None
                    if value is not None and kind == "s":
                        value = shared[int(value)] if int(value) < len(shared) else ""
                    elif value is not None and kind not in ("str", "e", "b"):
                        try:
                            value = float(value)
                        except ValueError:
                            pass
                if value not in (None, ""):
                    values[position] = value
            width = max(values) + 1 if values else 0
            rows.append([values.get(position) for position in range(width)])
        return rows


def excel_date(value):
    if isinstance(value, float) and 30000 < value < 80000:
        return (datetime(1899, 12, 30) + timedelta(days=int(value))).strftime("%Y-%m-%d")
    text = str(value or "").strip()
    match = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    match = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", text)
    if match:
        year = int(match.group(3))
        year += 2000 if year < 100 else 0
        try:
            return datetime(year, int(match.group(2)), int(match.group(1))).strftime("%Y-%m-%d")
        except ValueError:
            return ""
    return ""


def hour_value(value):
    if isinstance(value, float):
        return value
    text = str(value or "").strip().replace(" ", "")
    if not text:
        return 0.0
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def parse_nivelamento(data):
    rows = xlsx_rows(data)
    header_index = None
    for index, row in enumerate(rows[:15]):
        labels = [str(cell).lower() for cell in row if isinstance(cell, str)]
        if any(re.search(r"nome|funcion|colab|executor", label) for label in labels) and any("centro" in label for label in labels):
            header_index = index
            break
    if header_index is None:
        raise ValueError("Não encontrei as colunas de nome do funcionário e Centro de trabalho no cabeçalho da planilha.")
    header = rows[header_index]
    name_col = next(i for i, cell in enumerate(header) if isinstance(cell, str) and re.search(r"nome|funcion|colab|executor", cell.lower()))
    center_col = next(i for i, cell in enumerate(header) if isinstance(cell, str) and "centro" in cell.lower())
    date_col = next((i for i, cell in enumerate(header) if isinstance(cell, str) and cell.strip().lower() in ("data", "dia")), None)
    hh_col = next((i for i, cell in enumerate(header) if isinstance(cell, str) and re.search(r"hh|hora", cell.lower())), None)
    day_cols = {}
    if date_col is None:
        for i, cell in enumerate(header):
            if i in (name_col, center_col):
                continue
            day = excel_date(cell)
            if day:
                day_cols[i] = day
        if not day_cols:
            raise ValueError("Não encontrei colunas de data com HH disponível por dia.")
    elif hh_col is None:
        raise ValueError("Não encontrei a coluna de HH disponível.")

    def cell_at(row, position):
        return row[position] if position < len(row) else None

    entries = []
    has_hours = False
    for row in rows[header_index + 1:]:
        name = str(cell_at(row, name_col) or "").strip()
        if not name or name.lower().startswith("total"):
            continue
        center = str(cell_at(row, center_col) or "").strip()
        if date_col is not None:
            day = excel_date(cell_at(row, date_col))
            hours = hour_value(cell_at(row, hh_col))
            if day and hours:
                entries.append({"name": name, "workCenter": center, "date": day, "hh": hours})
                has_hours = True
        else:
            for position, day in day_cols.items():
                hours = hour_value(cell_at(row, position))
                entries.append({"name": name, "workCenter": center, "date": day, "hh": hours})
                has_hours = has_hours or bool(hours)
    if not has_hours:
        raise ValueError("A planilha não contém HH disponível por dia.")
    return entries


def parse_conf_codes(data):
    rows = xlsx_rows(data)
    code_col = tag_col = header_index = None
    header_cells = []
    for index, row in enumerate(rows[:15]):
        labels = [re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", str(cell)).lower()) if isinstance(cell, str) else "" for cell in row]
        code_labels = ("codigo", "ponto", "cod", "id")
        code_label = next((label for label in code_labels if label in labels), None)
        if code_label and "tag" in labels:
            header_index, code_col, tag_col = index, labels.index(code_label), labels.index("tag")
            header_cells = row
            break
    if header_index is None:
        raise ValueError("Não encontrei as colunas Código (ou Ponto) e Tag no cabeçalho da planilha.")

    def text_at(row, position):
        value = row[position] if position < len(row) else None
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        return str(value if value is not None else "").strip()[:200]

    extra_columns = []
    for position, cell in enumerate(header_cells):
        label = str(cell).strip()[:60] if cell not in (None, "") else ""
        if label and position not in (code_col, tag_col) and label not in [name for _, name in extra_columns]:
            extra_columns.append((position, label))

    codes, seen = [], set()
    for row in rows[header_index + 1:]:
        code, tag = text_at(row, code_col), text_at(row, tag_col)
        if code and code not in seen:
            seen.add(code)
            codes.append({
                "code": code[:80],
                "tag": tag[:80],
                "extra": {label: text_at(row, position) for position, label in extra_columns},
            })
    if not codes:
        raise ValueError("A planilha não contém códigos.")
    headers = {
        "code": str(header_cells[code_col]).strip()[:60] or "Código",
        "tag": str(header_cells[tag_col]).strip()[:60] or "Tag",
        "extras": [label for _, label in extra_columns],
    }
    return codes[:5000], headers


def route_header(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def route_header_date(value):
    if isinstance(value, (int, float)) and 20000 < value < 80000:
        return (datetime(1899, 12, 30) + timedelta(days=int(value))).strftime("%Y-%m-%d")
    text = str(value or "").strip()
    match = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", text)
    if match:
        year, month, day = map(int, match.groups())
    else:
        match = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b", text)
        if not match:
            return ""
        day, month, year = map(int, match.groups())
    try:
        return datetime(year, month, day).strftime("%Y-%m-%d")
    except ValueError:
        return ""


def parse_conf_routes(data):
    rows = xlsx_rows(data, "rota")
    header_index = code_col = technique_col = tag_col = order_type_col = None
    header_row = []
    for index, row in enumerate(rows[:30]):
        labels = [route_header(value) for value in row]
        if "codigo" in labels and "tecnica" in labels:
            header_index = index
            code_col = labels.index("codigo")
            technique_col = labels.index("tecnica")
            tag_col = labels.index("tag") if "tag" in labels else None
            order_type_col = labels.index("tipo") if "tipo" in labels else None
            header_row = row
            break
    if header_index is None:
        raise ValueError("Não encontrei as colunas CÓDIGO e TÉCNICA. Carregue a planilha atualizada.")
    date_columns = {
        position: route_header_date(value)
        for position, value in enumerate(header_row[code_col + 1:], start=code_col + 1)
        if route_header_date(value)
    }
    if not date_columns:
        raise ValueError("Não encontrei datas após a coluna CÓDIGO na planilha.")

    records = {}
    for row_number, row in enumerate(rows[header_index + 1:], start=header_index + 2):
        value = row[code_col] if code_col < len(row) else None
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        code = str(value if value is not None else "").strip()
        technique = str(row[technique_col] or "").strip() if technique_col < len(row) else ""
        tag = str(row[tag_col] or "").strip() if tag_col is not None and tag_col < len(row) else ""
        order_type = str(row[order_type_col] or "").strip() if order_type_col is not None and order_type_col < len(row) else ""
        has_marks = any(
            str(row[position] if position < len(row) and row[position] is not None else "").strip().upper() == "X"
            for position in date_columns
        )
        if not code and not technique and not has_marks:
            continue
        if not code or not technique:
            raise ValueError(f"A linha {row_number} precisa informar CÓDIGO e TÉCNICA.")
        key = (code.upper(), route_header(technique), tag.upper(), order_type.upper())
        record = records.setdefault(key, {"code": code[:200], "technique": technique[:100], "tag": tag[:200], "orderType": order_type[:80], "dates": []})
        for position, date in date_columns.items():
            value = str(row[position] if position < len(row) and row[position] is not None else "").strip().upper()
            if value == "X" and date not in record["dates"]:
                record["dates"].append(date)
    if not records:
        raise ValueError("A planilha não contém linhas com CÓDIGO e TÉCNICA.")
    result = list(records.values())
    for record in result:
        record["dates"].sort()
    return result


def parse_itss_inspections(path):
    lines = iter(enumerate(decode_export(path).splitlines(), start=1))
    required = ("descricao atividade", "status", "data", "nome matricula", "tipo ordem")
    columns = None
    records = []
    for row_number, line in lines:
        row = line.split("\t")
        labels = [route_header(value) for value in row]
        if all(label in labels for label in required):
            columns = {label: labels.index(label) for label in required}
            continue
        if columns is None or not any(cell.strip() for cell in row):
            continue
        if not line.startswith("\t"):
            continue
        while len(row) <= max(columns.values()):
            try:
                _, continuation = next(lines)
            except StopIteration as error:
                raise ValueError(f"Linha {row_number} da exportação ITSS está incompleta.") from error
            if re.match(r"^\t\d+\t[^\t]*\t[^\t]+\t\d+\t", continuation):
                raise ValueError(f"Linha {row_number} da exportação ITSS está incompleta.")
            parts = continuation.split("\t")
            row[-1] += "\n" + parts[0]
            row.extend(parts[1:])
        description = row[columns["descricao atividade"]].strip()
        if "_" not in description:
            continue
        tag = description.split("_", 1)[0].strip()
        status = row[columns["status"]].strip().upper()
        order_type = row[columns["tipo ordem"]].strip()
        if not tag or not status or not order_type:
            continue
        raw_date = row[columns["data"]].strip()
        try:
            date = datetime.strptime(raw_date, "%d.%m.%Y").date().isoformat()
        except ValueError as error:
            raise ValueError(f"Data inválida na linha {row_number} da exportação ITSS: {raw_date!r}.") from error
        records.append({
            "tag": tag, "status": status, "date": date,
            "name": row[columns["nome matricula"]].strip(), "orderType": order_type,
        })
    if columns is None:
        raise ValueError("A exportação ITSS não contém as colunas de atividade, status, data, nome e tipo de ordem.")
    return records


def excel_column(number):
    name = ""
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        name = chr(65 + remainder) + name
    return name


def conf_codes_xlsx(codes, stored, headers=None):
    headers = headers or {}
    extras = headers.get("extras") or sorted({key for item in codes for key in item.get("extra", {})})
    usage = {}
    for area_id, entry in stored.items():
        if area_id not in CONF_AREAS or not isinstance(entry, dict):
            continue
        for point in entry.get("points", []):
            usage.setdefault(point.get("code", ""), []).append((CONF_AREAS[area_id], point.get("id", "")))
    rows = [[headers.get("code") or "Código", headers.get("tag") or "Tag", *extras, "Área", "Ponto"]]
    for item in codes:
        values = [item.get("extra", {}).get(label, "") for label in extras]
        for area_name, point_id in usage.get(item["code"], [("", "")]):
            rows.append([item["code"], item["tag"], *values, area_name, point_id])

    def cell(reference, value):
        text = escape(str(value))
        return f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'

    body = "".join(
        f'<row r="{number}">' + "".join(cell(f"{excel_column(column + 1)}{number}", value) for column, value in enumerate(row)) + "</row>"
        for number, row in enumerate(rows, start=1)
    )
    main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    package = "http://schemas.openxmlformats.org/package/2006/relationships"
    header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    parts = {
        "[Content_Types].xml": header + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": header + f'<Relationships xmlns="{package}"><Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": header + f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets><sheet name="Códigos" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": header + f'<Relationships xmlns="{package}"><Relationship Id="rId1" Type="{rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": header + f'<worksheet xmlns="{main}"><sheetData>{body}</sheetData></worksheet>',
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content.encode("utf-8"))
    return buffer.getvalue()


def detect_image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def conf_image_path(area):
    for extension in CONF_IMAGE_TYPES:
        path = CONF_DIR / f"{area}.{extension}"
        if path.is_file():
            return path
    return None


def load_conf_points():
    if not CONF_FILE.is_file():
        return {}
    try:
        data = json.loads(CONF_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def save_conf_points(data):
    CONF_DIR.mkdir(exist_ok=True)
    CONF_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def clean_conf_points(points):
    if not isinstance(points, list) or len(points) > 500:
        raise ValueError("Pontos de controle inválidos.")
    cleaned = []
    seen = set()
    for point in points:
        if not isinstance(point, dict):
            raise ValueError("Pontos de controle inválidos.")
        point_id = point.get("id")
        x, y = point.get("x"), point.get("y")
        if (
            not isinstance(point_id, str)
            or not re.fullmatch(r"P\d{2,4}", point_id)
            or point_id in seen
            or isinstance(x, bool) or isinstance(y, bool)
            or not isinstance(x, (int, float)) or not isinstance(y, (int, float))
            or not (0 <= x <= 100 and 0 <= y <= 100)
        ):
            raise ValueError("Pontos de controle inválidos.")
        seen.add(point_id)
        code = point.get("code", "")
        if not isinstance(code, str) or len(code) > 80:
            raise ValueError("Pontos de controle inválidos.")
        cleaned.append({"id": point_id, "x": round(float(x), 3), "y": round(float(y), 3), "code": code})
    return cleaned


def load_nivelamento():
    if not NIVELAMENTO_FILE.is_file():
        return {"file": None, "updated": None, "records": []}
    return json.loads(NIVELAMENTO_FILE.read_text(encoding="utf-8"))


def execute_script(background=False):
    with STATE_LOCK:
        STATE.update(state="running", message="O SAP GUI está executando a rotina IW28.")

    target = ROOT.parent / DATA_SOURCES["iw28"][0]
    temporary = target.with_name(f"IW28_{uuid.uuid4().hex}.txt")
    try:
        if not target.parent.is_dir():
            raise FileNotFoundError(f"A pasta de exportação {target.parent} não foi encontrada.")
        command = ["cscript.exe", "//NoLogo", str(SCRIPT), str(temporary.parent), temporary.name]
        if background:
            command.append("background")
        result = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            timeout=600,
        )
        if result.returncode != 0:
            details = (result.stderr or result.stdout).strip()
            message = f"Falha ao executar a rotina (código {result.returncode})."
            if details:
                message = f"{message} {details[-1000:]}"
            state = "error"
        elif not temporary.is_file():
            raise RuntimeError("O SAP não criou o arquivo de exportação IW28.")
        else:
            lines = decode_export(temporary).splitlines()
            if not any("Nota" in line and ("Ordem" in line or "Descrição" in line) for line in lines):
                raise ValueError("O arquivo exportado não contém o cabeçalho esperado da IW28.")
            temporary.replace(target)
            message = "Rotina IW28 concluída."
            state = "done"
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        state = "error"
        message = f"Não foi possível concluir a exportação IW28: {error}"
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        SAP_WRITE_LOCK.release()

    with STATE_LOCK:
        STATE.update(state=state, message=message)


def execute_itss():
    temporary = ITSS_FILE.with_name(f"ITSS_Rotas_{uuid.uuid4().hex}.txt")
    with STATE_LOCK:
        ITSS_STATE.update(state="running", message="O SAP GUI está executando a rotina ITSS.")
    try:
        if not ITSS_SCRIPT.is_file():
            raise FileNotFoundError(f"O script {ITSS_SCRIPT.name} não foi encontrado.")
        if not ITSS_FILE.parent.is_dir():
            raise FileNotFoundError(f"A pasta de exportação {ITSS_FILE.parent} não foi encontrada.")
        result = subprocess.run(
            ["cscript.exe", "//NoLogo", str(ITSS_SCRIPT), str(temporary.parent), temporary.name],
            cwd=ROOT, capture_output=True, text=True, check=False, timeout=300,
        )
        if result.returncode:
            details = (result.stderr or result.stdout).strip()
            raise RuntimeError(f"Falha no script ITSS (código {result.returncode}): {details[-1000:]}")
        if not temporary.is_file():
            raise RuntimeError("O SAP não criou o arquivo de exportação ITSS.")
        lines = decode_export(temporary).splitlines()
        header = next((index for index, line in enumerate(lines) if "Matrícula" in line and "Ordem" in line and "Descrição Atividade" in line), None)
        if header is None:
            raise ValueError("O arquivo exportado não contém o cabeçalho esperado da rotina ITSS.")
        if not any(line.strip() for line in lines[header + 1:]):
            raise ValueError("A exportação ITSS não contém registros.")
        temporary.replace(ITSS_FILE)
        state = "done"
        message = f"Exportação ITSS concluída e salva em {ITSS_FILE}."
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        state = "error"
        message = f"Não foi possível concluir a exportação ITSS: {error}"
    finally:
        try:
            if temporary.exists():
                temporary.unlink()
        except OSError as error:
            state = "error"
            message = f"{message} Não foi possível remover o arquivo temporário {temporary}: {error}"
        with STATE_LOCK:
            ITSS_STATE.update(state=state, message=message)
        SAP_WRITE_LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def send_body(self, status_code, body, content_type):
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_body(status_code, body, "application/json; charset=utf-8")

    def is_local_request(self):
        return (
            self.client_address[0] in ("127.0.0.1", "::1")
            and self.headers.get("Host") == f"{HOST}:{PORT}"
        )

    def do_GET(self):
        if not self.is_local_request():
            self.send_error(403)
            return

        path = urlparse(self.path).path
        if path == "/":
            self.send_body(200, INDEX.read_bytes(), "text/html; charset=utf-8")
        elif path == "/dashboard":
            self.send_body(200, DASHBOARD.read_bytes(), "text/html; charset=utf-8")
        elif path == "/gantt":
            self.send_body(200, GANTT.read_bytes(), "text/html; charset=utf-8")
        elif path == "/kanban":
            self.send_body(200, KANBAN.read_bytes(), "text/html; charset=utf-8")
        elif path == "/nivelamento":
            self.send_body(200, NIVELAMENTO.read_bytes(), "text/html; charset=utf-8")
        elif path == "/confiabilidade":
            self.send_body(200, CONFIABILIDADE.read_bytes(), "text/html; charset=utf-8")
        elif path == "/rims-one-logo.png":
            try:
                self.send_body(200, BRAND_IMAGE.read_bytes(), "image/png")
            except OSError as error:
                self.send_json(500, {"message": f"Não foi possível carregar a imagem do cabeçalho: {error}"})
        elif path == "/sidebar.js":
            try:
                self.send_body(200, SIDEBAR_SCRIPT.read_bytes(), "text/javascript; charset=utf-8")
            except OSError as error:
                self.send_json(500, {"message": f"Não foi possível carregar a barra lateral: {error}"})
        elif path in ("/api/confiabilidade/routes", "/api/confiabilidade/routes/file"):
            try:
                with CONF_LOCK:
                    if not CONF_ROUTES_FILE.is_file():
                        self.send_json(404, {"message": "Nenhuma planilha de rotas carregada."})
                        return
                    routes = json.loads(CONF_ROUTES_FILE.read_text(encoding="utf-8"))
                if path.endswith("/file"):
                    content = base64.b64decode(routes["content"], validate=True)
                    self.send_body(200, content, "application/octet-stream")
                else:
                    records = parse_conf_routes(base64.b64decode(routes["content"], validate=True))
                    self.send_json(200, {
                        "file": routes["file"],
                        "updated": routes["updated"],
                        "count": len(records),
                        "scheduleCount": sum(len(record.get("dates", [])) for record in records),
                        "records": records,
                    })
            except (OSError, ValueError, KeyError, zipfile.BadZipFile, ET.ParseError) as error:
                self.send_json(500, {"message": f"Não foi possível ler a planilha de rotas: {error}"})
        elif path == "/api/confiabilidade":
            with CONF_LOCK:
                stored = load_conf_points()
                areas = []
                for area_id, name in CONF_AREAS.items():
                    entry = stored.get(area_id)
                    points = entry.get("points", []) if isinstance(entry, dict) else []
                    image = conf_image_path(area_id)
                    areas.append({
                        "id": area_id,
                        "name": name,
                        "hasImage": image is not None,
                        "version": int(image.stat().st_mtime_ns) if image else 0,
                        "points": points,
                    })
            if CONF_CODES_FILE.is_file():
                try:
                    codes = json.loads(CONF_CODES_FILE.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    codes = {}
            else:
                codes = {}
            self.send_json(200, {"areas": areas, "codes": codes.get("codes", []), "codesHeaders": codes.get("headers", {}), "codesFile": codes.get("file", ""), "codesUpdated": codes.get("updated", "")})
        elif path == "/api/confiabilidade/codes.xlsx":
            with CONF_LOCK:
                try:
                    stored_codes = json.loads(CONF_CODES_FILE.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    stored_codes = {}
                codes = stored_codes.get("codes", [])
                code_headers = stored_codes.get("headers", {})
                stored = load_conf_points()
            if not codes:
                self.send_json(404, {"message": "Nenhuma tabela de códigos carregada."})
                return
            body = conf_codes_xlsx(codes, stored, code_headers)
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Disposition", 'attachment; filename="codigos_pontos_de_controle.xlsx"')
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
        elif path == "/api/confiabilidade/image":
            area = parse_qs(urlparse(self.path).query).get("area", [""])[0]
            image = conf_image_path(area) if area in CONF_AREAS else None
            if image is None:
                self.send_error(404)
                return
            self.send_body(200, image.read_bytes(), CONF_IMAGE_TYPES[image.suffix[1:]])
        elif path == "/api/nivelamento":
            try:
                with NIVELAMENTO_LOCK:
                    data = load_nivelamento()
            except (OSError, ValueError) as error:
                self.send_json(500, {"message": str(error)})
                return
            self.send_json(200, data)
        elif path == "/api/status":
            with STATE_LOCK:
                status = dict(STATE)
            self.send_json(200, status)
        elif path == "/api/itss/status":
            with STATE_LOCK:
                status = dict(ITSS_STATE)
            self.send_json(200, status)
        elif path == "/api/itss/export":
            try:
                body = decode_export(ITSS_FILE).encode("utf-8")
            except (OSError, ValueError) as error:
                self.send_json(500, {"message": f"Não foi possível ler a exportação ITSS: {error}"})
                return
            self.send_body(200, body, "text/plain; charset=utf-8")
        elif path == "/api/itss/inspections":
            try:
                records = parse_itss_inspections(ITSS_FILE)
            except (OSError, ValueError, csv.Error) as error:
                self.send_json(500, {"message": f"Não foi possível ler as inspeções ITSS: {error}"})
                return
            self.send_json(200, {"records": records})
        elif path == "/itss.js":
            self.send_body(200, ITSS_CLIENT.read_bytes(), "text/javascript; charset=utf-8")
        elif path == "/api/sources":
            sources = []
            for source_id, (relative_path, label) in DATA_SOURCES.items():
                file_path = ROOT.parent / relative_path
                if not file_path.is_file():
                    continue
                try:
                    parsed_path, _, records = parse_export(source_id)
                    sources.append({
                        "id": source_id,
                        "label": label,
                        "count": len(records),
                        "updated": datetime.fromtimestamp(parsed_path.stat().st_mtime).strftime("%d.%m.%Y %H:%M"),
                    })
                except (OSError, ValueError) as error:
                    self.send_json(500, {"message": str(error)})
                    return
            self.send_json(200, {"sources": sources})
        elif path in ("/api/data", "/api/export"):
            query = urlparse(self.path).query
            source_id = dict(part.split("=", 1) for part in query.split("&") if "=" in part).get("source", "")
            if source_id not in DATA_SOURCES:
                self.send_json(400, {"message": "Selecione um arquivo de origem válido."})
                return
            try:
                file_path, _, records = parse_export(source_id)
                with PLAN_LOCK:
                    plans = load_plans()
                apply_plans(source_id, records, plans)
            except (OSError, ValueError, RuntimeError) as error:
                self.send_json(500, {"message": str(error)})
                return
            if path == "/api/data":
                self.send_json(200, {"file": file_path.name, "records": records})
            else:
                body = csv_export(records)
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="planejamento-{source_id}.csv"')
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(body)
        else:
            self.send_error(404)

    def handle_nivelamento_upload(self):
        if self.headers.get("Origin") != f"http://{HOST}:{PORT}":
            self.send_json(400, {"message": "Origem da requisição inválida."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length <= 0 or length > NIVELAMENTO_MAX_BYTES:
            self.send_json(400, {"message": "Arquivo inválido ou maior que 10 MB."})
            return
        data = self.rfile.read(length)
        try:
            records = parse_nivelamento(data)
        except (ValueError, ET.ParseError, KeyError) as error:
            self.send_json(400, {"message": str(error)})
            return
        filename = unquote(self.headers.get("X-File-Name", "Nivelamento 2026.xlsx"))[:120]
        payload = {
            "file": filename,
            "updated": datetime.now().strftime("%d.%m.%Y %H:%M"),
            "records": records,
        }
        with NIVELAMENTO_LOCK:
            NIVELAMENTO_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        self.send_json(200, {"file": filename, "updated": payload["updated"], "count": len(records)})

    def handle_confiabilidade_codes(self):
        if self.headers.get("Origin") != f"http://{HOST}:{PORT}":
            self.send_json(400, {"message": "Origem da requisição inválida."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length <= 0 or length > NIVELAMENTO_MAX_BYTES:
            self.send_json(400, {"message": "Arquivo inválido ou maior que 10 MB."})
            return
        data = self.rfile.read(length)
        try:
            codes, code_headers = parse_conf_codes(data)
        except (ValueError, ET.ParseError, KeyError, zipfile.BadZipFile) as error:
            self.send_json(400, {"message": str(error)})
            return
        payload = {
            "file": unquote(self.headers.get("X-File-Name", "codigos.xlsx"))[:120],
            "updated": datetime.now().strftime("%d.%m.%Y %H:%M"),
            "headers": code_headers,
            "codes": codes,
        }
        with CONF_LOCK:
            CONF_DIR.mkdir(exist_ok=True)
            CONF_CODES_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        self.send_json(200, {"count": len(codes), "file": payload["file"], "columns": code_headers["extras"]})

    def handle_confiabilidade_routes(self):
        if self.headers.get("Origin") != f"http://{HOST}:{PORT}":
            self.send_json(400, {"message": "Origem da requisição inválida."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length <= 0 or length > NIVELAMENTO_MAX_BYTES:
            self.send_json(400, {"message": "Arquivo inválido ou maior que 10 MB."})
            return
        filename = unquote(self.headers.get("X-File-Name", ""))[:120]
        extension = Path(filename).suffix.lower()
        if extension not in (".xls", ".xlsx"):
            self.send_json(400, {"message": "Selecione uma planilha .xls ou .xlsx."})
            return
        data = self.rfile.read(length)
        if len(data) != length:
            self.send_json(400, {"message": "O arquivo de rotas foi recebido incompleto."})
            return
        try:
            if extension == ".xlsx":
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    if "xl/workbook.xml" not in archive.namelist():
                        raise ValueError("O arquivo não é uma planilha .xlsx válida.")
                records = parse_conf_routes(data)
            else:
                raise ValueError("Para interpretar as datas e as marcações X, abra a planilha .xls no Excel e salve uma cópia no formato .xlsx.")
            payload = {
                "file": filename,
                "updated": datetime.now().strftime("%d.%m.%Y %H:%M"),
                "content": base64.b64encode(data).decode("ascii"),
                "records": records,
            }
            with CONF_LOCK:
                CONF_DIR.mkdir(exist_ok=True)
                temporary = CONF_DIR / f"rotas-{uuid.uuid4().hex}.tmp"
                try:
                    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
                    temporary.replace(CONF_ROUTES_FILE)
                finally:
                    if temporary.exists():
                        temporary.unlink()
        except (ValueError, zipfile.BadZipFile, ET.ParseError, KeyError) as error:
            self.send_json(400, {"message": f"Não foi possível validar a planilha de rotas: {error}"})
            return
        except OSError as error:
            self.send_json(500, {"message": f"Não foi possível salvar a planilha de rotas: {error}"})
            return
        self.send_json(200, {
            "file": payload["file"],
            "updated": payload["updated"],
            "count": len(records),
            "scheduleCount": sum(len(record["dates"]) for record in records),
            "records": records,
        })

    def handle_confiabilidade(self, path):
        if self.headers.get("Origin") != f"http://{HOST}:{PORT}":
            self.send_json(400, {"message": "Origem da requisição inválida."})
            return
        area = parse_qs(urlparse(self.path).query).get("area", [""])[0]
        if area not in CONF_AREAS:
            self.send_json(400, {"message": "Área inválida."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        limit = CONF_IMAGE_MAX_BYTES if path == "/api/confiabilidade/image" else 256 * 1024
        if length < 0 or length > limit:
            self.send_json(400, {"message": "Conteúdo inválido ou maior que o limite permitido."})
            return
        body = self.rfile.read(length) if length else b""

        with CONF_LOCK:
            stored = load_conf_points()
            entry = stored.get(area) if isinstance(stored.get(area), dict) else {}
            if path == "/api/confiabilidade/image":
                extension = detect_image_extension(body)
                if extension is None:
                    self.send_json(400, {"message": "Envie uma imagem PNG, JPG, GIF ou WEBP."})
                    return
                CONF_DIR.mkdir(exist_ok=True)
                previous = conf_image_path(area)
                (CONF_DIR / f"{area}.{extension}").write_bytes(body)
                if previous is not None and previous.suffix[1:] != extension:
                    previous.unlink()
            elif path == "/api/confiabilidade/image/delete":
                previous = conf_image_path(area)
                if previous is not None:
                    previous.unlink()
                stored.pop(area, None)
                save_conf_points(stored)
            else:
                try:
                    payload = json.loads(body.decode("utf-8"))
                    points = clean_conf_points(payload.get("points") if isinstance(payload, dict) else None)
                except (ValueError, UnicodeDecodeError) as error:
                    self.send_json(400, {"message": str(error)})
                    return
                if conf_image_path(area) is None:
                    self.send_json(400, {"message": "Carregue uma imagem antes de adicionar pontos."})
                    return
                entry["points"] = points
                stored[area] = entry
                save_conf_points(stored)
        self.send_json(200, {"ok": True})

    def do_POST(self):
        if not self.is_local_request():
            self.send_error(403)
            return
        path = urlparse(self.path).path
        if path == "/api/nivelamento":
            self.handle_nivelamento_upload()
            return
        if path == "/api/confiabilidade/codes":
            self.handle_confiabilidade_codes()
            return
        if path == "/api/confiabilidade/routes":
            self.handle_confiabilidade_routes()
            return
        if path in ("/api/confiabilidade/image", "/api/confiabilidade/image/delete", "/api/confiabilidade/points"):
            self.handle_confiabilidade(path)
            return
        if path not in ("/api/run", "/api/itss/run", "/api/plan", "/api/iw22/status"):
            self.send_error(404)
            return

        try:
            body = validate_request_body(self)
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return

        if path == "/api/iw22/status":
            if (
                not isinstance(body, dict)
                or set(body) != {"source", "id", "action"}
                or body["source"] != "iw28"
                or not isinstance(body["id"], str)
                or body["action"] not in ("close", "reopen")
            ):
                self.send_json(400, {"message": "Dados da alteração de status inválidos."})
                return
            if not SAP_WRITE_LOCK.acquire(blocking=False):
                self.send_json(409, {"message": "Outra operação SAP está em andamento. Aguarde antes de alterar o status."})
                return
            try:
                try:
                    _, _, records = parse_export("iw28")
                    record = next((item for item in records if item["id"] == body["id"]), None)
                    if record is None:
                        self.send_json(404, {"message": "O registro não existe mais no arquivo. Atualize a lista e tente novamente."})
                        return
                    note_number = record["note"].strip()
                    if not re.fullmatch(r"[0-9]{1,12}", note_number):
                        self.send_json(400, {"message": "A nota selecionada não contém um número IW22 válido."})
                        return
                except (OSError, ValueError, RuntimeError) as error:
                    self.send_json(500, {"message": f"Não foi possível validar a nota para o SAP: {error}"})
                    return
                try:
                    sap_message = execute_iw22_status(note_number, body["action"])
                except RuntimeError as error:
                    self.send_json(502, {
                        "message": f"Não foi possível confirmar a alteração da nota {note_number}. Verifique-a no IW22 antes de tentar novamente. {error}"
                    })
                    return
                self.send_json(200, {"sapMessage": sap_message})
            finally:
                SAP_WRITE_LOCK.release()
            return

        if path == "/api/plan":
            source_id = body.get("source") if isinstance(body, dict) else None
            record_id = body.get("id") if isinstance(body, dict) else None
            updates = body.get("updates") if isinstance(body, dict) else None
            bulk = body.get("bulk", False) if isinstance(body, dict) else False
            if (
                not isinstance(source_id, str)
                or source_id not in DATA_SOURCES
                or not isinstance(record_id, str)
                or not isinstance(updates, dict)
                or not isinstance(bulk, bool)
            ):
                self.send_json(400, {"message": "Dados do ajuste inválidos."})
                return
            if source_id != "iw28":
                self.send_json(400, {"message": "A gravação IW22 está disponível somente para a exportação IW28."})
                return
            allowed = {
                "executor", "priority", "desiredStart", "desiredCompletion",
                "shutdownDuration", "shutdown", "sapDescription",
            }
            if set(updates) != allowed:
                self.send_json(400, {"message": "Preencha todos os campos do ajuste."})
                return
            if any(not isinstance(value, str) for value in updates.values()):
                self.send_json(400, {"message": "Os campos do ajuste devem ser textos."})
                return
            if (
                len(updates["executor"]) > 160
                or len(updates["sapDescription"]) > 40
            ):
                self.send_json(400, {"message": "Executante ou descrição excede o limite permitido (descrição SAP: 40 caracteres)."})
                return
            if updates["priority"] not in ("", *SAP_PRIORITY_KEYS):
                self.send_json(400, {"message": "Selecione uma prioridade SAP válida."})
                return
            if len(updates["shutdownDuration"]) > 40:
                self.send_json(400, {"message": "A duração da parada excede o limite permitido."})
                return
            if updates["shutdown"] not in ("", "X"):
                self.send_json(400, {"message": "O campo Parada deve estar marcado ou desmarcado."})
                return
            for field, label in (
                ("desiredStart", "início desejado"),
                ("desiredCompletion", "conclusão desejada"),
            ):
                if updates[field]:
                    try:
                        datetime.strptime(updates[field], "%Y-%m-%d")
                    except ValueError:
                        self.send_json(400, {"message": f"Informe um {label} válido."})
                        return
            try:
                _, _, records = parse_export(source_id)
                record = next((item for item in records if item["id"] == record_id), None)
                if record is None:
                    self.send_json(404, {"message": "O registro não existe mais no arquivo. Atualize a lista e tente novamente."})
                    return
                note_number = record["note"].strip()
                if not note_number.isdigit() or len(note_number) > 12:
                    self.send_json(400, {"message": "A nota selecionada não contém um número IW22 válido."})
                    return
            except (OSError, ValueError, RuntimeError) as error:
                self.send_json(500, {"message": f"Não foi possível validar a nota para o SAP: {error}"})
                return

            if not SAP_WRITE_LOCK.acquire(blocking=False):
                self.send_json(409, {"message": "Já existe uma atualização SAP em andamento. Aguarde antes de salvar outra nota."})
                return
            try:
                try:
                    with PLAN_LOCK:
                        plans = load_plans()
                        source_plans = plans.setdefault(source_id, {})
                        previous_updates = source_plans.get(record_id, {})
                        saved_updates = dict(previous_updates) if isinstance(previous_updates, dict) else {}
                        if "description" in saved_updates and "planningDescription" not in saved_updates:
                            saved_updates["planningDescription"] = saved_updates.pop("description")
                        saved_updates.update(updates)
                        source_plans[record_id] = saved_updates
                        save_plans(plans)
                    record.update(saved_updates)
                except (OSError, ValueError, RuntimeError) as error:
                    self.send_json(500, {"message": f"Não foi possível salvar o ajuste local: {error}"})
                    return

                try:
                    sap_message = execute_iw22(note_number, updates, bulk=bulk)
                except RuntimeError as error:
                    self.send_json(502, {
                        "message": (
                            f"O ajuste local foi salvo, mas a gravação no SAP não foi confirmada. "
                            f"Verifique a nota {note_number} no IW22 antes de tentar novamente. {error}"
                        ),
                        "localSaved": True,
                        "record": record,
                    })
                    return
                self.send_json(200, {"record": record, "sapMessage": sap_message})
            finally:
                SAP_WRITE_LOCK.release()
            return

        if not isinstance(body, dict):
            self.send_json(400, {"message": "Dados da requisição inválidos."})
            return

        if path == "/api/itss/run":
            if not SAP_WRITE_LOCK.acquire(blocking=False):
                self.send_json(409, {"message": "Outra operação SAP está em andamento. Aguarde antes de executar o ITSS."})
                return
            with STATE_LOCK:
                ITSS_STATE.update(state="queued", message="Execução ITSS solicitada. Aguardando o SAP GUI.")
            try:
                threading.Thread(target=execute_itss, daemon=True).start()
            except RuntimeError as error:
                SAP_WRITE_LOCK.release()
                with STATE_LOCK:
                    ITSS_STATE.update(state="error", message=f"Não foi possível iniciar a execução ITSS: {error}")
                self.send_json(500, dict(ITSS_STATE))
                return
            with STATE_LOCK:
                status = dict(ITSS_STATE)
            self.send_json(202, status)
            return

        if set(body) - {"background"} or not isinstance(body.get("background", False), bool):
            self.send_json(400, {"message": "Dados da execução IW28 inválidos."})
            return
        background = body.get("background", False)
        with STATE_LOCK:
            if STATE["state"] in ("queued", "running"):
                self.send_json(409, STATE)
                return
            if not SAP_WRITE_LOCK.acquire(blocking=False):
                self.send_json(409, {"message": "Outra operação SAP está em andamento. Aguarde antes de executar o IW28."})
                return
            STATE.update(
                state="queued",
                message="Execução solicitada. Aguardando o SAP GUI.",
            )

        try:
            threading.Thread(target=execute_script, kwargs={"background": background}, daemon=True).start()
        except RuntimeError as error:
            SAP_WRITE_LOCK.release()
            with STATE_LOCK:
                STATE.update(state="error", message=f"Não foi possível iniciar a execução IW28: {error}")
                status = dict(STATE)
            self.send_json(500, status)
            return
        with STATE_LOCK:
            status = dict(STATE)
        self.send_json(202, status)

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")


if __name__ == "__main__":
    if not SCRIPT.is_file() or not INDEX.is_file() or not DASHBOARD.is_file() or not GANTT.is_file() or not KANBAN.is_file() or not NIVELAMENTO.is_file() or not CONFIABILIDADE.is_file():
        raise FileNotFoundError("Os arquivos index.html, dashboard.html, gantt.html e iw28.vbs devem estar na mesma pasta do servidor.")

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serviço SAP PM disponível em http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServiço encerrado.")
    finally:
        server.server_close()
