# Repository instructions
Перед любой UI/CSS задачей прочитайте `docs/DESIGN_SYSTEM.md`, `docs/UI_COPY_RULES.md` и shared primitives в `src/components/ui`.

Не создавайте локальный redesign в feature patch. Переиспользуйте tokens и primitives. Для UI обязательно проверьте mobile, loading/error/empty/partial states и accessibility (labels, keyboard, focus, ARIA). Visual baselines не являются обязательной проверкой до отдельного подключения Playwright.
