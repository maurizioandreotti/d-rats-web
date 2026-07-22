import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../store/chat-store'
import { usePortStore } from '../store/port-store'
import { useConfigStore } from '../store/config-store'
import { useStationStore } from '../store/station-store'
import type { ChatEngine } from '../engine/chat'

interface ChatPanelProps {
  chatRef: React.MutableRefObject<ChatEngine | null>
}

export function ChatPanel({ chatRef }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages)
  const config = useConfigStore((s) => s.config)
  const portStatuses = usePortStore((s) => s.statuses)
  const [input, setInput] = useState('')
  const [dest, setDest] = useState('CQCQCQ')
  const [selectedPort, setSelectedPort] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const connectedPorts = config.ports.filter((p) => portStatuses[p.name] === 'connected')

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!selectedPort && connectedPorts.length > 0) {
      setSelectedPort(connectedPorts[0]!.name)
    }
  }, [connectedPorts, selectedPort])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    const id = crypto.randomUUID()
    useChatStore.getState().addMessage({
      id,
      from: config.myCallsign || 'N0CALL',
      to: dest,
      text,
      timestamp: Date.now(),
      direction: 'outgoing',
      port: selectedPort || undefined,
    })
    setInput('')

    chatRef.current?.sendText(text, dest, selectedPort || undefined).catch((err) => {
      console.error('[ChatPanel] sendText failed:', err)
    })
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

      {connectedPorts.length > 0 && (
        <div className="chat-channels">
          {connectedPorts.map((p) => (
            <button
              key={p.name}
              className={`channel-badge ${selectedPort === p.name ? 'active' : ''}`}
              onClick={() => setSelectedPort(p.name)}
            >
              <span className={`channel-dot ${p.type === 'ratflector' ? 'rat' : 'ser'}`} />
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="empty-state">No messages yet. Type a message below to start.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.direction}`}>
            <div className="chat-header">
              <span className="chat-callsign">{msg.from}</span>
              <span className="chat-dest">{'\u2192'} {msg.to}</span>
              {msg.port && <span className="chat-port">[{msg.port}]</span>}
              <span className="chat-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="chat-text">{msg.text}</div>
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <select className="chat-dest-select" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="CQCQCQ">CQCQCQ</option>
          {Object.keys(useStationStore.getState().stations).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {connectedPorts.length > 0 && (
          <select className="chat-dest-select" value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)}>
            {connectedPorts.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        )}
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send)"
          rows={2}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
