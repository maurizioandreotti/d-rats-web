import { useState, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import wikiIndex from '../../docs/wiki/index.md?raw'
import wikiRadioSetup from '../../docs/wiki/radio-setup.md?raw'
import wikiTechnical from '../../docs/wiki/technical.md?raw'
import wikiTroubleshooting from '../../docs/wiki/troubleshooting.md?raw'

const PAGES: Record<string, { title: string; content: string }> = {
  index: { title: 'Wiki Home', content: wikiIndex },
  'radio-setup': { title: 'Radio Setup', content: wikiRadioSetup },
  technical: { title: 'Technical Aspects', content: wikiTechnical },
  troubleshooting: { title: 'Troubleshooting', content: wikiTroubleshooting },
}

function isInternalHref(href: string): string | null {
  const stripped = href.replace(/^https?:\/\/[^/]+\//, '')
  const pagePart = stripped.replace(/#.*$/, '')
  for (const key of Object.keys(PAGES)) {
    if (pagePart === `${key}.md` || pagePart === `./${key}.md`) return key
  }
  return null
}

function getAnchor(href: string): string | null {
  const m = href.match(/#(.+)$/)
  return m ? m[1]!.toLowerCase() : null
}

export function WikiPanel() {
  const [page, setPage] = useState('index')
  const [anchor, setAnchor] = useState<string | null>(null)
  const current = PAGES[page]
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!anchor) return
    setTimeout(() => {
      const el = contentRef.current?.querySelector(`#${CSS.escape(anchor)}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setAnchor(null)
    }, 50)
  }, [page, anchor])

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href')
    if (!href) return
    const pageKey = isInternalHref(href)
    if (pageKey) {
      e.preventDefault()
      setPage(pageKey)
      setAnchor(getAnchor(href))
    } else if (href.startsWith('#')) {
      e.preventDefault()
      setAnchor(href.slice(1))
    }
  }, [])

  if (!current) {
    return <div className="wiki-panel">Page not found</div>
  }

  return (
    <div className="wiki-panel">
      <nav className="wiki-nav">
        {Object.entries(PAGES).map(([key, p]) => (
          <button
            key={key}
            className={`wiki-nav-btn ${key === page ? 'active' : ''}`}
            onClick={() => setPage(key)}
          >
            {p.title}
          </button>
        ))}
      </nav>

      <div className="wiki-content" ref={contentRef} onClick={handleLinkClick}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
          {current.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
