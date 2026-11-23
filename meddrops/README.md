# MedDrops — Flashcards & Áudio

PWA estático (HTML/CSS/JS puro, sem build) para GitHub Pages. Funciona offline; dados, progresso e áudios ficam no IndexedDB.

**Acesso:** `https://<usuario>.github.io/<repo>/meddrops/` → no iPhone: Safari › Compartilhar › *Adicionar à Tela de Início*.

## Conteúdo
- `dados/manifesto.json` lista os arquivos de cards (`arquivos[].arquivo`); `audioBase` resolve os `audioUrl` relativos.
- Cada arquivo é um array JSON com o schema: `id, grandeArea, subarea, assunto, titulo, frente, verso, roteiroAudio, audioUrl, tags`.
- `audios/<id>.mp3` (opcional). Sem mp3, o app lê o `roteiroAudio` com a voz pt-BR do aparelho.
- Em **Ajustes**: sincronizar, importar `.json`/`.csv` (cabeçalhos iguais ao schema; tags separadas por `;`), baixar áudios offline, backup do progresso.

## Repetição espaçada
Errei (10 min) · Difícil · Bom · Fácil, com intervalos crescentes (estilo SM‑2) e limite diário de novos configurável.

## Atualizar versão do app
Altere `CACHE` em `sw.js` ao mudar `app.js`/`styles.css`.
