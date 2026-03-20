import TurndownService from 'turndown';

const HTML_TEMPLATE = (title: string, body: string) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #111;
      max-width: 65ch;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    p {
      text-align: justify;
      hyphens: auto;
      text-justify: inter-word;
      margin: 0 0 0.75em 0;
    }
    p:last-child { margin-bottom: 0; }
    h1 { font-size: 2rem; margin-top: 1.5em; margin-bottom: 0.5em; }
    h2 { font-size: 1.5rem; margin-top: 1.2em; margin-bottom: 0.4em; }
    h3 { font-size: 1.25rem; margin-top: 1em; margin-bottom: 0.35em; }
    h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
    blockquote { border-left: 3px solid #6366f1; padding-left: 1rem; margin-left: 0; color: #52525b; font-style: italic; }
    ul, ol { padding-left: 1.5rem; margin: 0.75em 0; }
    .pdf-print-note { font-size: 0.8rem; color: #6366f1; margin-bottom: 1rem; padding: 0.5rem 0; }
    @media print {
      .pdf-print-note { display: none !important; }
      body {
        margin: 2cm auto;
        padding: 0;
        color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body * { color: #000; }
      h1 { page-break-before: always; }
      h1:first-of-type { page-break-before: avoid; }
      h1, h2, h3, blockquote { page-break-inside: avoid; }
      p { orphans: 2; widows: 2; }
    }
  </style>
</head>
<body>
<p class="pdf-print-note" role="note">Pour supprimer la date, le titre et l’URL du PDF : dans la fenêtre d’impression, ouvrez « Plus de paramètres » et décochez « En-têtes et pieds de page ».</p>
${body}
</body>
</html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToHtml(htmlContent: string, title: string): void {
  const full = HTML_TEMPLATE(title, htmlContent);
  const blob = new Blob([full], { type: 'text/html;charset=utf-8' });
  const filename = `${title.replace(/[^\w\s-]/g, '').trim() || 'export'}.html`;
  downloadBlob(blob, filename);
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export function exportToMarkdown(htmlContent: string, title: string): void {
  const md = turndown.turndown(htmlContent || '');
  const withTitle = `# ${title}\n\n${md}`;
  const blob = new Blob([withTitle], { type: 'text/markdown;charset=utf-8' });
  const filename = `${title.replace(/[^\w\s-]/g, '').trim() || 'export'}.md`;
  downloadBlob(blob, filename);
}

/** Ouvre une fenêtre d’impression avec le contenu : l’utilisateur peut choisir "Enregistrer au format PDF". */
export function exportToPdf(htmlContent: string, title: string): void {
  const full = HTML_TEMPLATE(title, htmlContent);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Autorisez les fenêtres pop-up pour exporter en PDF.');
    return;
  }
  printWindow.document.write(full);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.onafterprint = () => printWindow.close();
  };
}

/** Export Word : HTML enregistré avec l’extension .doc (Word l’ouvre correctement). */
export function exportToWord(htmlContent: string, title: string): void {
  const full = HTML_TEMPLATE(title, htmlContent);
  const blob = new Blob(
    ['\ufeff' + full],
    { type: 'application/msword;charset=utf-8' }
  );
  const filename = `${title.replace(/[^\w\s-]/g, '').trim() || 'export'}.doc`;
  downloadBlob(blob, filename);
}
