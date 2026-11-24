# Guia: adicionar conteúdo ao MedDrops

## 1. Onde ficam os arquivos
Não é preciso criar "pastas por área". A hierarquia **Grande área › Assunto geral › Assunto específico** vem de **dentro** de cada card (campos `grandeArea`, `subarea`, `assunto`), não das pastas.

```
meddrops/
  dados/
    manifesto.json                 ← lista dos arquivos (precisa ser atualizado a cada arquivo novo)
    clinica_toxicologia.json       ← 1 arquivo por tema (nome livre, sem espaços/acentos)
    go_prenatal.json
  audios/
    cm-tox-001.mp3                 ← opcional; nome = id do card
```
(Se quiser organizar em subpastas, pode: `dados/clinica/toxicologia.json`, e no manifesto escreva `"arquivo": "clinica/toxicologia.json"`.)

## 2. Passo a passo (pelo site do GitHub, no celular ou computador)
1. Entre em `meddrops/dados` › **Add file › Create new file**.
2. Nome: `clinica_toxicologia.json`. Cole o conteúdo que a IA gerou. **Commit changes**.
3. Abra `meddrops/dados/manifesto.json` › lápis (editar) e adicione uma linha na lista `arquivos`:
   ```json
   { "arquivo": "clinica_toxicologia.json" }
   ```
   (separe os itens com vírgula). **Commit changes**.
4. No app: **Ajustes › Sincronizar com o repositório**.

Atalho sem GitHub: salve o arquivo no iPhone e use **Ajustes › Importar .json ou .csv** (fica só naquele aparelho).

## 3. Instruções para a IA (copie e cole)

```
Você vai criar flashcards de medicina para o app MedDrops. Entregue APENAS um arquivo JSON válido
(um array de objetos), sem texto antes ou depois, sem comentários, sem blocos markdown se eu pedir "arquivo".
Use aspas duplas, UTF-8, sem vírgula sobrando no final.

Cada card tem EXATAMENTE estes campos (todos texto, exceto tags):
- "id": único e estável, minúsculo, sem espaço/acento, padrão <area>-<assunto>-<NNN>. Ex.: "cm-tox-001". Nunca repetir nem reutilizar ids.
- "grandeArea": nível 1. Ex.: "Clínica Médica", "Cirurgia", "Pediatria", "Ginecologia e Obstetrícia", "Medicina Preventiva".
- "subarea": nível 2 (assunto geral). Ex.: "Toxicologia clínica", "Cardiologia", "Pré-natal".
- "assunto": nível 3 (assunto específico). Ex.: "Intoxicação alcoólica", "Organofosforados".
- "titulo": título curto do card.
- "frente": pergunta clara, uma ideia por card (compreensão/raciocínio clínico, não decoreba).
- "verso": resposta objetiva e completa, com condutas, doses e critérios quando relevantes.
- "roteiroAudio": texto para ser LIDO em voz alta em pt-BR: frases curtas, sem siglas soltas, sem símbolos
  (escreva "maior ou igual a", "miligramas", "por cento"), números por extenso quando possível, 40 a 120 palavras.
- "audioUrl": "audios/<id>.mp3" (use esse padrão sempre; o app lê a voz do aparelho se o mp3 não existir).
- "tags": lista de strings curtas em minúsculas, sem acento. Ex.: ["antidoto","urgencia"].

Regras de consistência (MUITO IMPORTANTE):
- Use sempre a MESMA grafia de grandeArea, subarea e assunto entre cards (maiúsculas, acentos e espaços idênticos),
  senão o filtro do app cria categorias duplicadas.
- Conteúdo conforme diretrizes brasileiras atuais (MS/Febrasgo/SBP/SBC etc.) e bancas de residência (ENARE, USP, UNIFESP...).
  Se não tiver certeza de uma dose ou critério, não invente: omita ou sinalize no verso com "(confirmar na diretriz)".
- Um assunto específico = de 5 a 15 cards.

Nome do arquivo: <area>_<assunto>.json (minúsculo, sem acento, underline). Ex.: clinica_toxicologia.json.
Ao final, informe também a linha para o manifesto, neste formato:
{ "arquivo": "clinica_toxicologia.json" }

Exemplo de 1 card:
[
  {
    "id": "cm-tox-001",
    "grandeArea": "Clínica Médica",
    "subarea": "Toxicologia clínica",
    "assunto": "Organofosforados",
    "titulo": "Síndrome colinérgica",
    "frente": "Quadro clínico clássico e antídoto de escolha na intoxicação por organofosforados?",
    "verso": "Miose, sialorreia, broncorreia, bradicardia, fasciculações. Antídoto: atropina até secar secreções pulmonares + pralidoxima.",
    "roteiroAudio": "Na intoxicação por organofosforados há excesso de acetilcolina. O paciente tem miose, saliva e secreção brônquica abundantes e bradicardia. O antídoto é a atropina, em doses crescentes até secar a secreção pulmonar. A pralidoxima reativa a enzima, mas não deve atrasar a atropina.",
    "audioUrl": "audios/cm-tox-001.mp3",
    "tags": ["antidoto", "urgencia"]
  }
]

Assunto desta vez: <DIGITE AQUI: grande área › assunto geral › assunto específico>.
```

## 4. Se algo der errado
- Cole o JSON em jsonlint.com para achar vírgula/aspas faltando.
- Arquivo listado no manifesto mas inexistente: o app avisa que alguns arquivos falharam e mantém o resto.
- Card sem `frente` ou `verso` é ignorado.
