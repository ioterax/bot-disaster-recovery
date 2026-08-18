#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIRECTORY="$(cd -- "${SCRIPT_DIRECTORY}/.." && pwd)"
readonly DOCS_VENV="${PROJECT_DIRECTORY}/.venv-docs"
readonly REQUIREMENTS_FILE="${PROJECT_DIRECTORY}/requirements-docs.txt"

command -v python3 >/dev/null 2>&1 || {
  echo "Erro: python3 não foi encontrado no PATH." >&2
  exit 1
}

if [[ ! -d "${DOCS_VENV}" ]]; then
  echo "Criando ambiente virtual em ${DOCS_VENV}"
  python3 -m venv "${DOCS_VENV}"
fi

if [[ ! -x "${DOCS_VENV}/bin/python" ]]; then
  echo "Erro: ambiente virtual inválido em ${DOCS_VENV}." >&2
  exit 1
fi

"${DOCS_VENV}/bin/python" -m pip install --disable-pip-version-check --quiet --requirement "${REQUIREMENTS_FILE}"

cd "${PROJECT_DIRECTORY}"
echo "Documentação disponível em http://127.0.0.1:8000"
exec "${DOCS_VENV}/bin/python" -m mkdocs serve --dev-addr "127.0.0.1:8000" "$@"
