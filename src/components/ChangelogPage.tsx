import { ApertureSigil } from './ApertureSigil'
import changelogSource from '../../CHANGELOG.md?raw'
import { APP_VERSION } from '../lib/version'

interface ChangelogPageProps {
  onHome: () => void
}

export function ChangelogPage({ onHome }: ChangelogPageProps) {
  const blocks = renderChangelog(changelogSource)

  return (
    <>
      <header className="dwr-header left">
        <button
          type="button"
          onClick={onHome}
          className="dwr-home-link"
          aria-label="Back to homepage"
        >
          <ApertureSigil size={40} />
          <span className="dwr-wm sm">
            <span>DOTA</span>
            <span className="red">WEAKNESS</span>
            <span>REPORT</span>
          </span>
        </button>
      </header>

      <section className="dwr-changelog">
        <div className="dwr-changelog-head">
          <div className="dwr-changelog-eyebrow">CURRENT · v{APP_VERSION}</div>
          <h1 className="dwr-changelog-title">Changelog</h1>
          <div className="dwr-divider" style={{ maxWidth: 320, margin: '12px auto 0' }}>
            <span className="line" />
            <span className="diamond" />
            <span className="line" />
          </div>
        </div>

        <article className="dwr-changelog-body">{blocks}</article>
      </section>
    </>
  )
}

// Tiny markdown renderer scoped to the shape of CHANGELOG.md: HTML
// comments (skipped), `## h2`, paragraphs, and `- bullet` lists. Not a
// general-purpose parser — if we add tables/code/etc. to the changelog
// we'll need to extend this.
type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

function renderChangelog(src: string): JSX.Element[] {
  const cleaned = src.replace(/<!--[\s\S]*?-->/g, '')
  const lines = cleaned.split(/\r?\n/)
  const blocks: Block[] = []
  let para: string[] = []
  let list: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join(' ') })
      para = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push({ kind: 'ul', items: list })
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    if (line.startsWith('## ')) {
      flushPara()
      flushList()
      blocks.push({ kind: 'h2', text: line.slice(3).trim() })
      continue
    }
    if (line.startsWith('# ')) {
      flushPara()
      flushList()
      blocks.push({ kind: 'h1', text: line.slice(2).trim() })
      continue
    }
    if (line.startsWith('- ')) {
      flushPara()
      list.push(line.slice(2).trim())
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()

  return blocks.map((b, i) => {
    switch (b.kind) {
      case 'h1':
        return null
      case 'h2':
        return <h2 key={i} className="dwr-changelog-h2">{b.text}</h2>
      case 'p':
        return <p key={i} className="dwr-changelog-p">{b.text}</p>
      case 'ul':
        return (
          <ul key={i} className="dwr-changelog-ul">
            {b.items.map((it, j) => <li key={j}>{it}</li>)}
          </ul>
        )
    }
  }).filter(Boolean) as JSX.Element[]
}
