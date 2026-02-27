import { useState } from 'react';
import { apiFetch } from '../lib/api';

type Message = {
  role: 'user' | 'assistant';
  text: string;
};

const QUICK_ACTIONS = [
  { label: 'Branding ideas', purpose: 'branding_help', prompt: 'Help me choose branding colors and a tagline.' },
  { label: 'Pricing tips', purpose: 'pricing_suggestions', prompt: 'Suggest simple pricing packages for tyre services.' },
  { label: 'Email template', purpose: 'email_templates', prompt: 'Draft a friendly booking confirmation email.' },
  { label: 'Service descriptions', purpose: 'catalog_descriptions', prompt: 'Write a short service description for brake inspection.' },
  { label: 'Booking policy', purpose: 'booking_policies', prompt: 'Write a clear booking policy for cancellations and no-shows.' },
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendMessage(text: string, purpose?: string) {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');

    try {
      const res = await apiFetch('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, purpose }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: res?.message || 'No response.' }]);
    } catch (err: any) {
      setError(err.message || 'AI request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="ai-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Close AI' : 'Open AI'}
      </button>
      {open && (
        <aside className="ai-sidebar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Tenant Assistant</h3>
            <button className="button" onClick={() => setMessages([])} style={{ padding: '8px 10px' }}>
              Clear
            </button>
          </div>

          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_ACTIONS.map((action) => (
              <button key={action.label} className="badge" onClick={() => sendMessage(action.prompt, action.purpose)} type="button">
                {action.label}
              </button>
            ))}
          </div>

          <div className="ai-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`ai-message ${message.role}`}>
                <strong>{message.role === 'assistant' ? 'AI' : 'You'}</strong>
                <p style={{ margin: 0 }}>{message.text}</p>
              </div>
            ))}
            {messages.length === 0 && <p className="muted">Ask about setup, templates, or configuration.</p>}
          </div>

          {error && <p style={{ color: '#ff8a8a', marginBottom: 0 }}>{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input, 'general');
            }}
          >
            <textarea
              className="input"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question"
            />
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
