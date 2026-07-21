import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../store/chat-store'

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    const id = crypto.randomUUID()
    useChatStore.getState().addMessage({
      id,
      from: 'me',
      to: 'CQCQCQ',
      text,
      timestamp: Date.now(),
      direction: 'outgoing',
    })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-layout">
      <h2>Chat</h2>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="empty-state">No messages yet. Type a message below to start.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.direction}`}>
            <div className="chat-header">
              <span className="chat-callsign">{msg.from}</span>
              <span className="chat-dest">{'→'} {msg.to}</span>
              <span className="chat-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="chat-text">{msg.text}</div>
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={2}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
