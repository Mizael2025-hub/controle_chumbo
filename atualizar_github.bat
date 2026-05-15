@echo off
chcp 65001 > nul
:: Configura terminal para UTF-8 para exibir caracteres e acentos em PT-BR

:INPUT_MESSAGE
set /p commitMessage="Digite a alteracao (Mensagem do Commit): "

:: Tratamento de erro: Impede commit vazio com alerta visual em vermelho
if "%commitMessage%"=="" (
    color 0C
    echo [ERRO] A mensagem nao pode ficar vazia! Tente novamente.
    color 07
    echo.
    goto INPUT_MESSAGE
)

echo.
echo [INFO] Preparando arquivos...
git add .

echo.
echo [INFO] Salvando alteracoes...
git commit -m "%commitMessage%"

echo.
echo [INFO] Enviando para o GitHub...
git push

:: Tratamento de erro: Verifica falha no push
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] Falha ao enviar para o GitHub. Verifique os avisos acima.
    pause
    color 07
    exit /b %errorlevel%
)

color 0A
echo.
echo [SUCESSO] Sistema atualizado no GitHub com exito!
pause
color 07