# XPath Helper Pro

Расширение для Chrome (Manifest V3), которое помогает строить, проверять и выполнять XPath на любой странице, с упором на **Angular Material**. Поддерживает список шагов (клик, ввод, загрузка файла, пауза), экспорт/импорт в JSON для автотестов и эмуляцию загрузки файлов.

---

## Возможности

- **Инспектор** — наведение с зажатым **Ctrl** или **Alt+X**: генерация нескольких вариантов XPath, проверка уникальности, фильтр по типу (ID, атрибуты, классы, текст, Angular Material, контекст).
- **Список на выполнение** — добавление шагов с действиями: клик, ввод, загрузка файла, пауза, пауза до элемента, ветвление, assert, переход, действие пользователя. Редактирование, удаление, изменение порядка. Выполнение всего списка или одного шага с подсветкой текущего.
- **Окружения и переменные** — dev/stage/prod с переменными `{{baseUrl}}`, `{{login}}` и т.п. в шагах.
- **Data-driven** — импорт CSV/JSON с данными, прогон сценария для каждой строки.
- **Экспорт в JSON** — сохранение сценария в формате для автотестов.
- **Экспорт в Python Playwright** — тесты с pytest fixtures, conftest.py, `@pytest.mark.parametrize` и exit code 0/1.
- **📦 POM-шаблон** — полный проект: config/, pages/, tests/, test_data/, utils/, base_page, conftest, requirements.txt.
- **Отчёт** — экспорт HTML/JSON с именем файла из настроек.
- **Настройки** — задержка наведения, ожидание селектора, пауза между шагами.

---

## Установка

1. Клонируйте репозиторий или скачайте папку `xpath-helper-extension`.
2. В Chrome откройте `chrome://extensions/`, включите **«Режим разработчика»**.
3. Нажмите **«Загрузить распакованное расширение»** и укажите папку `xpath-helper-extension`.
4. Иконка расширения появится на панели; по клику открывается боковая панель (Side Panel).

---

## Использование

### Инспектор

- Зажмите **Ctrl** или нажмите **Alt+X** (режим без удержания Ctrl) и наводите курсор на элементы — в панели появятся сгенерированные XPath и информация об элементе.
- Внизу справа отображается индикатор **✦ XPath Helper** (клик — открыть панель). В режиме инспекции он подсвечивается.
- В панели: основной XPath, списки уникальных/неуникальных, фильтр по типу, копирование, «Для консоли», экспорт списка XPath. У каждого варианта — кнопка **➕** «Добавить в список».

### Список шагов

- Вкладка **«Список»**: добавление шагов («Добавить текущий», «Шаг вручную»), выбор действия (клик, ввод, загрузка файла, пауза). Для загрузки файла можно указать имя и прикрепить файл (содержимое хранится в base64).
- **▶ Выполнить** — выполнение всех шагов по порядку с подсветкой текущего; при ошибке выполнение продолжается (настраивается).
- У каждого шага — кнопка **▶** для выполнения только этого шага.
- **Экспорт JSON** — скачивание сценария с полем `step` (номер шага) для автотестов. **Загрузить шаги** — импорт из JSON.

### Настройки

- **Задержка наведения (мс)** — debounce при наведении (80–200 мс).
- **Ожидание селектора (мс)** — максимальное время ожидания появления элемента по XPath при выполнении шагов (0–60000 мс).

---

## Формат JSON для автотестов

Пример экспорта:

```json
{
  "name": "XPath Helper — сценарий",
  "version": 1,
  "exportedAt": "2025-03-06T12:00:00.000Z",
  "steps": [
    { "step": 1, "xpath": "//button[@id='submit']", "action": "click", "params": {} },
    { "step": 2, "xpath": "//input[@name='email']", "action": "input", "params": { "value": "user@example.com" } },
    { "step": 3, "xpath": "//input[@type='file']", "action": "file_upload", "params": { "fileName": "doc.pdf", "fileContentBase64": "JVBERi0xLjQK..." } },
    { "step": 4, "xpath": "", "action": "wait", "params": { "delayMs": 500 } }
  ]
}
```

- **step** — порядковый номер шага (обязателен при экспорте).
- **action** — `click` | `input` | `file_upload` | `wait`.
- **params** — для `input`: `value`; для `wait`: `delayMs`; для `file_upload`: `fileName`, опционально `fileContentBase64`.

---

## Data-driven: прогон по строкам данных

Сценарий можно выполнить для каждой строки из CSV или JSON. Переменные `{{login}}`, `{{baseUrl}}` и т.п. подставляются из данных строки.

### Кнопка «📊 Данные»

Загружает файл с данными:

- **CSV** — первая строка = заголовки (ключи переменных), остальные строки = данные.
- **JSON** — массив объектов или объект с полями `data` / `rows`.

**Пример CSV (`users.csv`):**

```csv
login,password,baseUrl
alice,secret123,https://dev.example.com
bob,pass456,https://dev.example.com
admin,admin789,https://stage.example.com
```

**Пример JSON (`users.json`):**

```json
[
  { "login": "alice", "password": "secret123", "baseUrl": "https://dev.example.com" },
  { "login": "bob", "password": "pass456", "baseUrl": "https://dev.example.com" },
  { "login": "admin", "password": "admin789", "baseUrl": "https://stage.example.com" }
]
```

**Альтернативный формат JSON (с `data` или `rows`):**

```json
{
  "data": [
    { "login": "alice", "password": "secret123" },
    { "login": "bob", "password": "pass456" }
  ]
}
```

### Кнопка «▶ Data-driven»

Выполняет сценарий для каждой строки данных. Переменные берутся из строки и объединяются с переменными окружения (dev/stage/prod).

**Пример:**

1. Шаги: переход на `{{baseUrl}}/login`, ввод `{{login}}` в поле логина, ввод `{{password}}` в поле пароля, клик по кнопке.
2. В «Данные» загружаете `users.csv` или `users.json`.
3. Нажимаете «▶ Data-driven».

Сценарий выполнится 3 раза (для alice, bob, admin) с подстановкой переменных из каждой строки.

---

## Окружения и переменные

Переменные задаются в модалке «⚙ Переменные» для окружений **dev**, **stage**, **prod**.

**Пример переменных для dev:**

| Ключ | Значение |
|------|----------|
| baseUrl | https://dev.example.com |
| login | test_user |
| apiUrl | https://api-dev.example.com |

В шагах: `{{baseUrl}}/login`, `{{login}}`, `{{apiUrl}}/v1`.

При Data-driven переменные из строки данных перекрывают переменные окружения.

---

## Экспорт в Python Playwright (pytest)

### Настройки Python Playwright

Перед экспортом нажмите **⚙ Python** и укажите:

| Поле | Описание | По умолчанию |
|------|----------|--------------|
| executable_path | Путь к chromium (chromium-gost) | `/opt/chromium-gost/chromium-gost` |
| user-data-dir | Профиль браузера | `/home/nuanred/.config/chromium` |
| remote-debugging-port | Порт отладки | 9222 |
| headless | Запуск без окна браузера | выкл |

Настройки сохраняются и подставляются в `test_*.py` и `conftest.py` при экспорте.

### Полный POM-шаблон (📦 POM-шаблон)

Кнопка **📦 POM-шаблон** создаёт скрипт `create_project_<name>.py`. Запустите его:

```bash
python create_project_scenario.py
```

Скрипт создаст структуру:

```
config/           # test_config.py с настройками chromium
pages/            # base_page.py (явные ожидания), scenario_page.py
tests/            # conftest.py, test_scenario.py
test_data/        # applicant_data.py, DATA_ROWS
utils/            # helpers.py (_sub для переменных)
requirements.txt
pytest.ini
README.md
```

- **base_page.py** — `click_with_wait`, `fill_with_validation`, `wait_for_element` с логами
- **scenario_page.py** — Page Object с методами из ваших шагов
- **config/test_config.py** — берёт настройки из ⚙ Python
- При Data-driven — `@pytest.mark.parametrize` и `run_scenario_with_data(data)`

### Pytest fixtures и conftest.py

При экспорте «📤 Python Playwright» скачиваются два файла:

- **conftest.py** — фикстура `page` с браузером и контекстом.
- **test_&lt;name&gt;.py** — тест, использующий фикстуру `page`.

**conftest.py:**

```python
"""
XPath Helper Pro — conftest.py (pytest fixtures)
Положите в ту же папку, что и тесты.
"""

import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="function")
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/opt/chromium-gost/chromium-gost",
            args=[
                "--remote-debugging-port=9222",
                "--user-data-dir=/home/nuanred/.config/chromium",
            ],
            headless=False,
        )
        context = browser.new_context()
        pg = context.new_page()
        try:
            yield pg
        finally:
            browser.close()
```

**test_login.py (пример):**

```python
"""
XPath Helper Pro — экспорт в Python Playwright
Запуск: pytest test_login.py -v
Или: python test_login.py
Exit code: 0 при успехе, 1 при ошибке.
"""

import sys
import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch(...)
        context = browser.new_context()
        pg = context.new_page()
        try:
            yield pg
        finally:
            browser.close()


def test_login(page):
    page.goto("https://example.com/login")
    page.locator("xpath=//input[@name='email']").fill("user@example.com")
    page.locator("xpath=//input[@name='password']").fill("secret")
    page.locator("xpath=//button[@type='submit']").click()


if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    sys.exit(exit_code)
```

### Параметризация @pytest.mark.parametrize (Data-driven)

Если загружены данные (Data-driven), экспорт добавляет `@pytest.mark.parametrize` и функцию `_sub()` для подстановки `{{var}}`.

**Пример:**

```python
import sys
import pytest
from playwright.sync_api import sync_playwright

DATA_ROWS = [
    {"login": "alice", "password": "secret123", "baseUrl": "https://dev.example.com"},
    {"login": "bob", "password": "pass456", "baseUrl": "https://dev.example.com"},
]

def _sub(s, data):
    if not s: return ""
    for k, v in data.items():
        s = s.replace("{{" + k + "}}", str(v))
    return s

@pytest.fixture
def page():
    # ... (как выше)

@pytest.mark.parametrize("data", DATA_ROWS, ids=[f"row_{i+1}" for i in range(len(DATA_ROWS))])
def test_login(page, data):
    page.goto(_sub("{{baseUrl}}/login", data))
    page.locator("xpath=//input[@name='email']").fill(_sub("{{login}}", data))
    page.locator("xpath=//input[@name='password']").fill(_sub("{{password}}", data))
    page.locator("xpath=//button[@type='submit']").click()


if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    sys.exit(exit_code)
```

### Exit code 0/1 в Python

Запуск через `pytest.main()` возвращает код выхода:

- **0** — все тесты пройдены.
- **1** — есть ошибки или провалы.

**Использование в CI:**

```bash
python test_login.py
echo $?  # 0 или 1
```

```bash
pytest test_login.py -v
echo $?  # 0 или 1
```

```yaml
# Пример для GitHub Actions
- name: Run tests
  run: pytest tests/ -v --tb=short
  # При fail pipeline завершится с ошибкой
```

---

## Отчёт в файл

Вкладка **«Лог»** содержит поле «Имя файла отчёта» (по умолчанию `report.html`).

- При экспорте отчёта (кнопка «📤 Отчёт») используется указанное имя.
- Значение сохраняется в storage и восстанавливается при следующем открытии.

**Примеры:**

- `report.html` — HTML-отчёт с таблицей шагов.
- `report-2024-03-06.html` — отчёт с датой.
- `reports/smoke.html` — путь/имя (браузер скачает файл с этим именем).

Для JSON-отчёта расширение заменяется на `.json` (например, `report.html` → `report.json`).

---

## Структура проекта

```
xpath-helper-extension/
├── manifest.json          # Манифест расширения (MV3)
├── background.js          # Service Worker: открытие панели, команда Alt+X
├── content/
│   ├── xpath-generator.js # Генерация и валидация XPath (Angular Material, классы, атрибуты, текст)
│   └── content.js         # Индикатор, hover, выполнение списка шагов, эмуляция файла
└── sidepanel/
    ├── sidepanel.html     # Вкладки «Инспектор» и «Список», модалка шага
    ├── sidepanel.css      # Стили панели
    └── sidepanel.js       # Логика панели: фильтры, список, экспорт/импорт, выполнение
```

---

## Требования

- Chrome (или совместимый браузер с поддержкой Manifest V3, Side Panel, `chrome.scripting`).

---

## Дополнительные возможности

- **Подсветка при ошибке** — при падении шага элемент подсвечивается красной рамкой.
- **Копирование XPath при ошибке** — кнопка 📋 у упавших шагов для копирования XPath/URL.
- **Предупреждение о хрупких XPath** — пометка XPath с `//div[1]`, `position()` и т.п.

---

## Возможные улучшения

Идеи по доработке (headless-режим, pytest-html отчёты, ограничение прав и др.) собраны в [IMPROVEMENTS.md](IMPROVEMENTS.md).

---

## Лицензия

Проект можно использовать и дорабатывать по своему усмотрению.
