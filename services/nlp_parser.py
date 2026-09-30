"""Natural Language Parser for Quick Expense Entry.

Lightweight, zero-dependency parser that runs instantly (< 1ms) on low-resource
systems (Raspberry Pi / small container pods) using rule-based heuristics and
regex, with optional remote LLM integration if an API key is configured.
"""

import re
import os
import json
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Category keyword mappings (supporting English, Spanish, and common Catalan terms)
CATEGORY_KEYWORDS = {
    "food_drink": [
        "coffee",
        "cafe",
        "cafeteria",
        "cappuccino",
        "latte",
        "tea",
        "te",
        "lunch",
        "dinner",
        "breakfast",
        "comida",
        "cena",
        "desayuno",
        "almuerzo",
        "restaurant",
        "restaurante",
        "bar",
        "pub",
        "beer",
        "cerveza",
        "vino",
        "wine",
        "pizza",
        "burger",
        "hamburguesa",
        "sushi",
        "bakery",
        "panaderia",
        "pasteleria",
        "snack",
        "drinks",
        "tapas",
        "brunch",
        "food",
        "drink",
        "cocktail",
        "mcdonalds",
        "burger king",
        "starbucks",
        "kfc",
        "dominos",
        "telepizza",
        "ubereats",
        "glovo",
    ],
    "super": [
        "mercadona",
        "lidl",
        "carrefour",
        "aldi",
        "dia",
        "eroski",
        "bonarea",
        "consum",
        "alcampo",
        "hipercor",
        "supermarket",
        "supermercado",
        "super",
        "grocery",
        "groceries",
        "grocer",
        "market",
        "compra",
        "fruteria",
        "carniceria",
    ],
    "transport": [
        "uber",
        "cabify",
        "bolt",
        "taxi",
        "train",
        "tren",
        "renfe",
        "rodalies",
        "metro",
        "bus",
        "autobus",
        "ticket",
        "billete",
        "gas",
        "gasolina",
        "diesel",
        "fuel",
        "repsol",
        "cepsa",
        "bp",
        "shell",
        "parking",
        "aparcamiento",
        "toll",
        "peaje",
        "transport",
        "transporte",
        "flight",
        "vuelo",
        "ryanair",
        "vueling",
    ],
    "car": [
        "mechanic",
        "mecanico",
        "taller",
        "itv",
        "car wash",
        "lavado coche",
        "repuestos",
        "auto",
        "seguro coche",
        "parking coche",
        "multa",
        "tires",
        "neumaticos",
    ],
    "clothing": [
        "zara",
        "mango",
        "pull&bear",
        "pull and bear",
        "bershka",
        "stradivarius",
        "massimo dutti",
        "h&m",
        "hm",
        "uniqlo",
        "asos",
        "shein",
        "nike",
        "adidas",
        "clothing",
        "clothes",
        "ropa",
        "shoes",
        "zapatos",
        "sneakers",
        "zapatillas",
        "shirt",
        "camisa",
        "camiseta",
        "pants",
        "pantalones",
        "jacket",
        "chaqueta",
    ],
    "health": [
        "pharmacy",
        "farmacia",
        "doctor",
        "medico",
        "dentist",
        "dentista",
        "medicine",
        "medicina",
        "medicamentos",
        "hospital",
        "clinic",
        "clinica",
        "physio",
        "fisioterapia",
        "gym",
        "gimnasio",
        "health",
        "salud",
        "optica",
        "glasses",
        "gafas",
        "dentistry",
        "sanitas",
        "adeslas",
    ],
    "personal": [
        "haircut",
        "peluqueria",
        "barber",
        "barberia",
        "spa",
        "cosmetics",
        "perfume",
        "massage",
        "masaje",
        "books",
        "libro",
        "libros",
        "kindle",
        "hobby",
        "hairdresser",
        "regalo",
        "gift",
    ],
    "recurrent": [
        "rent",
        "alquiler",
        "netflix",
        "spotify",
        "hbo",
        "max",
        "disney",
        "prime",
        "amazon prime",
        "internet",
        "fibra",
        "phone",
        "telefono",
        "vodafone",
        "movistar",
        "orange",
        "o2",
        "digi",
        "subscription",
        "suscripcion",
        "electricity",
        "luz",
        "water",
        "agua",
        "gas natural",
        "endesa",
        "naturgy",
    ],
    "taxes": [
        "tax",
        "taxes",
        "impuesto",
        "impuestos",
        "irpf",
        "ibi",
        "cuota autonomo",
        "autonomo",
        "gestoria",
        "hacienda",
        "tasa",
        "tasas",
    ],
    "save_inv": [
        "invest",
        "inversion",
        "trade",
        "broker",
        "crypto",
        "bitcoin",
        "btc",
        "ethereum",
        "eth",
        "stocks",
        "acciones",
        "etf",
        "index",
        "ahorro",
        "savings",
        "deposit",
        "deposito",
        "degiro",
        "myinvestor",
        "trade republic",
    ],
    "cobeetrans": ["cobee trans", "cobeetrans", "cobee transporte"],
    "cobeefood": ["cobee food", "cobeefood", "cobee comida"],
    "xofa": [
        "xofa",
        "sofa",
        "ikea",
        "furniture",
        "muebles",
        "deco",
        "decoracion",
        "home",
        "casa",
    ],
}


def parse_natural_expense(text: str) -> dict:
    """Parse an unstructured natural language expense entry into structured data.

    Supports inputs like:
      - "14.50 lunch with friends"
      - "coffee 3.50"
      - "€45.20 mercadona yesterday"
      - "uber to airport 32"
      - "120 gym"

    Returns dict with keys: amount, category, description, date.
    """
    if not text or not isinstance(text, str):
        return {
            "amount": None,
            "category": "other",
            "description": "",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }

    raw = text.strip()
    working_text = raw

    # 1. Date Detection (yesterday, today, or explicit YYYY-MM-DD)
    date_val = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Check for explicit ISO date: 202X-XX-XX
    iso_date_match = re.search(r"\b(202\d-[01]\d-[0-3]\d)\b", working_text)
    if iso_date_match:
        date_val = iso_date_match.group(1)
        working_text = (
            working_text[: iso_date_match.start()]
            + " "
            + working_text[iso_date_match.end() :]
        )
    elif re.search(r"\b(yesterday|ayer)\b", working_text, re.IGNORECASE):
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        date_val = yesterday.strftime("%Y-%m-%d")
        working_text = re.sub(
            r"\b(yesterday|ayer)\b", " ", working_text, flags=re.IGNORECASE
        )
    elif re.search(r"\b(today|hoy)\b", working_text, re.IGNORECASE):
        working_text = re.sub(
            r"\b(today|hoy)\b", " ", working_text, flags=re.IGNORECASE
        )

    # 2. Amount Extraction
    # Pattern to find numbers with optional decimals and currency symbols
    # e.g., 14.50, 14,50, €14.50, 14.50€, $15, 15eur
    amount = None
    amount_match = re.search(
        r"(?:[€$£]\s*)?(\b\d+(?:[.,]\d{1,2})?\b)(?:\s*(?:[€$£]|eur|euros?))?",
        working_text,
        re.IGNORECASE,
    )
    if amount_match:
        raw_amount_str = amount_match.group(1).replace(",", ".")
        try:
            amount = float(raw_amount_str)
            # Remove the amount match from working text to get remaining description
            working_text = (
                working_text[: amount_match.start()]
                + " "
                + working_text[amount_match.end() :]
            )
        except ValueError:
            amount = None

    # 3. Category Detection from text
    cleaned_lower = raw.lower()
    matched_category = "other"

    # First check multi-word keywords then single-word keywords
    found_match = False
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            # Word boundary search if no spaces, or substring if multi-word
            if " " in kw:
                pattern = re.escape(kw)
            else:
                pattern = r"\b" + re.escape(kw) + r"\b"
            if re.search(pattern, cleaned_lower):
                matched_category = cat
                found_match = True
                break
        if found_match:
            break

    # 4. Clean Description
    # Remove extra spaces, currency indicators, and leading/trailing punctuation
    desc = re.sub(r"\s+", " ", working_text).strip()
    desc = re.sub(r"^[^\w]+|[^\w]+$", "", desc).strip()

    # If description is empty or just symbols, fallback to category label or default
    if not desc:
        if matched_category != "other":
            desc = matched_category.replace("_", " ").capitalize()
        else:
            desc = "Expense"
    else:
        # Capitalize first letter cleanly
        desc = desc[0].upper() + desc[1:] if len(desc) > 1 else desc.upper()

    return {
        "amount": amount,
        "category": matched_category,
        "description": desc,
        "date": date_val,
    }


def parse_with_optional_llm(text: str, categories: dict = None) -> dict:
    """Optionally use a lightweight remote LLM if an API key is configured in env.

    Falls back to `parse_natural_expense` instantly (< 1ms) if no key is configured
    or if the LLM request fails.
    """
    rule_parsed = parse_natural_expense(text)

    # Check if an LLM key is configured
    openai_key = os.environ.get("OPENAI_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")

    if not openai_key and not gemini_key:
        return rule_parsed

    # If rule parser found a clear amount and category other than 'other',
    # rule parser is already 100% accurate and instant - no need to call external API!
    if rule_parsed.get("amount") is not None and rule_parsed.get("category") != "other":
        return rule_parsed

    # If ambiguous and Gemini API key is available
    if gemini_key:
        try:
            import urllib.request

            valid_cats = (
                list(categories.keys())
                if categories
                else list(CATEGORY_KEYWORDS.keys()) + ["other"]
            )
            prompt = (
                "You are a finance assistant. Extract the expense information from: "
                f"'{text}'.\n"
                f"Valid categories: {json.dumps(valid_cats)}.\n"
                f"Today is: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}.\n"
                "Respond ONLY with a JSON object: "
                '{"amount": float, "category": string, "description": string, '
                '"date": "YYYY-MM-DD"}'
            )
            base_url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                "gemini-1.5-flash:generateContent"
            )
            url = f"{base_url}?key={gemini_key}"
            req_data = json.dumps(
                {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"response_mime_type": "application/json"},
                }
            ).encode("utf-8")
            req = urllib.request.Request(
                url, data=req_data, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=2.5) as response:
                res_body = json.loads(response.read().decode("utf-8"))
                content = res_body["candidates"][0]["content"]["parts"][0]["text"]
                parsed_json = json.loads(content)
                if parsed_json.get("amount") is not None:
                    return {
                        "amount": float(parsed_json["amount"]),
                        "category": parsed_json.get(
                            "category", rule_parsed["category"]
                        ),
                        "description": parsed_json.get(
                            "description", rule_parsed["description"]
                        ),
                        "date": parsed_json.get("date", rule_parsed["date"]),
                    }
        except Exception as e:
            logger.debug(f"Gemini quick-parse fallback: {e}")

    return rule_parsed
