import React, { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Helper to process inline markdown: `code`, **bold**, *italic*, links
const renderInline = (text: string, keyPrefix: string) => {
  // Simple link autodetect (http/https)
  const urlRegex = /(https?:\/\/[^\s)]+)(\)|\s|$)/g;
  // Process inline code first to avoid styling inside code spans
  const segments = text.split('`');
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i % 2 === 1) {
      parts.push(
        <code key={`${keyPrefix}-code-${i}`} className="bg-stealth-card/50 text-stealth-primary px-2 py-1 rounded-md font-mono text-xs border border-stealth/30 backdrop-blur-sm">
          {seg}
        </code>
      );
    } else {
      // Bold and italic processing on non-code segments
      const boldSplit = seg.split('**');
      const boldParts: React.ReactNode[] = [];
      for (let j = 0; j < boldSplit.length; j++) {
        const bseg = boldSplit[j];
        if (j % 2 === 1) {
          boldParts.push(<strong key={`${keyPrefix}-b-${i}-${j}`} className="font-bold text-stealth-primary">{bseg}</strong>);
        } else {
          // Italic: *text*
          const italicSplit = bseg.split('*');
          for (let k = 0; k < italicSplit.length; k++) {
            const isItalic = k % 2 === 1;
            let chunk: React.ReactNode = italicSplit[k];
            // Links inside this chunk
            const withLinks: React.ReactNode[] = [];
            let lastIndex = 0;
            const strChunk = String(chunk);
            strChunk.replace(urlRegex, (match, url, _tail, offset) => {
              const before = strChunk.substring(lastIndex, offset);
              if (before) withLinks.push(before);
              withLinks.push(
                <a key={`${keyPrefix}-a-${i}-${j}-${k}-${offset}`} href={url} target="_blank" rel="noreferrer" className="text-stealth-primary underline decoration-stealth-primary/30 hover:decoration-stealth-primary/70 transition-colors duration-200">
                  {url}
                </a>
              );
              lastIndex = offset + String(url).length;
              return match;
            });
            const rest = strChunk.substring(lastIndex);
            if (rest) withLinks.push(rest);

            boldParts.push(
              <span key={`${keyPrefix}-i-${i}-${j}-${k}`} className={isItalic ? 'italic' : undefined}>
                {withLinks}
              </span>
            );
          }
        }
      }
      parts.push(<span key={`${keyPrefix}-seg-${i}`}>{boldParts}</span>);
    }
  }
  return parts;
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const elements = useMemo(() => {
    const lines = content.split('\n');
    const out: JSX.Element[] = [];
    let i = 0, key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Horizontal rule
      if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
        out.push(<hr key={`hr-${key++}`} className="my-4 border-t border-stealth/30" />);
        i++; continue;
      }

      // Blockquote / callout
      if (line.startsWith('>')) {
        const bq: string[] = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          bq.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push(
          <div key={`bq-${key++}`} className="relative my-3 p-4 rounded-lg bg-stealth-card/30 border border-stealth/30 backdrop-blur-sm">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-stealth-primary/60 rounded-l-lg" />
            <div className="text-sm text-stealth-primary space-y-2">
              {bq.map((l, idx) => (
                <p key={`bq-p-${idx}`} className="leading-relaxed">{renderInline(l, `bq-${idx}`)}</p>
              ))}
            </div>
          </div>
        );
        continue;
      }

      // Headings
      if (/^###\s+/.test(line)) {
        out.push(<h3 key={`h3-${key++}`} className="mt-4 mb-2 text-sm font-bold text-stealth-primary">{line.replace(/^###\s+/, '')}</h3>);
        i++; continue;
      }
      if (/^##\s+/.test(line)) {
        out.push(
          <div key={`h2-${key++}`} className="mt-5 mb-3">
            <h2 className="text-base font-bold text-stealth-primary">{line.replace(/^##\s+/, '')}</h2>
            <div className="mt-2 h-px bg-gradient-to-r from-stealth-primary/40 via-stealth-primary/20 to-transparent" />
          </div>
        );
        i++; continue;
      }
      if (/^#\s+/.test(line)) {
        out.push(
          <div key={`h1-${key++}`} className="mt-6 mb-4">
            <h1 className="text-lg font-bold text-stealth-primary tracking-tight">{line.replace(/^#\s+/, '')}</h1>
            <div className="mt-3 h-px bg-gradient-to-r from-stealth-primary/60 via-stealth-primary/30 to-transparent" />
          </div>
        );
        i++; continue;
      }

      // Fenced code block ```lang
      if (/^```/.test(line)) {
        const lang = line.replace(/^```\s*/, '').trim();
        const code: string[] = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        // skip closing ```
        if (i < lines.length && /^```/.test(lines[i])) i++;
        const codeText = code.join('\n');
        out.push(
          <div key={`code-${key++}`} className="my-4 rounded-xl border border-stealth/30 bg-stealth-card/20 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 text-xs text-stealth-text-secondary bg-stealth-card/30">
              <span className="font-mono uppercase tracking-wider font-semibold">{lang || 'code'}</span>
              <button
                className="px-3 py-1 rounded-md bg-stealth-card/50 hover:bg-stealth-card/70 transition-all duration-200 hover-lift text-stealth-primary font-medium"
                onClick={() => navigator.clipboard.writeText(codeText)}
                title="Copy code"
              >Copy</button>
            </div>
            <pre className="p-4 text-xs leading-relaxed font-mono text-stealth-primary whitespace-pre overflow-x-auto">
              {codeText}
            </pre>
          </div>
        );
        continue;
      }

      // Bulleted list
      if (/^(-|\*)\s+/.test(line)) {
        const items: string[] = [line.replace(/^(-|\*)\s+/, '')];
        i++;
        while (i < lines.length && /^(-|\*)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^(-|\*)\s+/, ''));
          i++;
        }
        out.push(
          <ul key={`ul-${key++}`} className="my-3 ml-3 space-y-2">
            {items.map((it, idx) => (
              <li key={`uli-${idx}`} className="text-sm text-stealth-primary flex items-start">
                <span className="mt-2 mr-3 w-2 h-2 rounded-full bg-stealth-primary/70 flex-shrink-0" />
                <span className="leading-relaxed">{renderInline(it, `ul-${idx}`)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered list
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [line.replace(/^\d+\.\s+/, '')];
        i++;
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ''));
          i++;
        }
        out.push(
          <ol key={`ol-${key++}`} className="my-3 ml-3 space-y-2">
            {items.map((it, idx) => (
              <li key={`oli-${idx}`} className="text-sm text-stealth-primary flex items-start">
                <span className="mt-0.5 mr-3 w-5 h-5 rounded-md bg-stealth-primary/20 text-stealth-primary text-xs flex items-center justify-center font-bold flex-shrink-0 border border-stealth/30">{idx + 1}</span>
                <span className="leading-relaxed">{renderInline(it, `ol-${idx}`)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Simple tables | a | b |
      if (/^\|.+\|$/.test(line)) {
        const rows: string[][] = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
          const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
          rows.push(cells);
          i++;
        }
        out.push(
          <div key={`tbl-${key++}`} className="my-4 overflow-x-auto rounded-xl border border-stealth/30 bg-stealth-card/20 backdrop-blur-sm">
            <table className="w-full text-left text-xs">
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={`tr-${ri}`} className={ri === 0 ? 'bg-stealth-card/30' : ri % 2 === 0 ? 'bg-transparent' : 'bg-stealth-card/10'}>
                    {r.map((c, ci) => (
                      <td key={`td-${ri}-${ci}`} className="px-4 py-3 text-stealth-primary border-t border-stealth/20 first:border-l-0">{renderInline(c, `td-${ri}-${ci}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Empty line -> spacer
      if (line.trim() === '') { i++; continue; }

      // Paragraph
      out.push(
        <p key={`p-${key++}`} className="text-sm text-stealth-primary leading-relaxed mb-3">
          {renderInline(line, `p-${key}`)}
        </p>
      );
      i++;
    }

    return out;
  }, [content]);

  return (
    <div className={`max-w-none ${className}`}>
      {elements}
    </div>
  );
};

export default MarkdownRenderer;
