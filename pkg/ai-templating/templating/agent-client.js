// Ask a Rancher AI agent one question and get its answer back as a string.
//
// The agent backend is reached exactly the way the Liz chat reaches it: a WebSocket proxied through
// the Kubernetes API server. Two things about that stream shape this file:
//
//   The socket does NOT close after an answer. It is a chat session, and stays open for the next
//   question — so the answer is complete at </message>, and waiting for onclose waits forever.
//
//   The <message> block is not all answer. The agent interleaves its own bookkeeping into it
//   (<think> as it reasons, <agent-metadata> naming which agent replied, <mcp-response> when it
//   called a tool). Those are stripped, or a caller parsing JSON out of the reply picks up the
//   metadata's braces instead of the answer's.
//
// One question, one answer, one promise — this is not a conversation.

const AGENT_NAMESPACE = 'cattle-ai-agent-system';
const AGENT_SERVICE = 'rancher-ai-agent';
const WS_PATH = 'v1/ws/messages';

const MESSAGE_START = '<message>';
const MESSAGE_END = '</message>';
const ERROR_TAGS = ['<chat-error>', '<error>'];

// Blocks that appear inside a message but are not part of the answer.
const NOISE = ['think', 'agent-metadata', 'mcp-response', 'chat-metadata', 'tool-call'];

function wsUrl() {
  return `wss://${ window.location.host }/api/v1/namespaces/${ AGENT_NAMESPACE }/services/http:${ AGENT_SERVICE }:80/proxy/${ WS_PATH }`;
}

/** The answer itself: what is between <message> and </message>, minus the agent's bookkeeping. */
function answerFrom(stream) {
  const start = stream.indexOf(MESSAGE_START);
  const end = stream.indexOf(MESSAGE_END, start < 0 ? 0 : start);
  const body = stream.slice(start < 0 ? 0 : start + MESSAGE_START.length, end < 0 ? undefined : end);

  return NOISE
    .reduce((text, tag) => text.replace(new RegExp(`<${ tag }>[\\s\\S]*?</${ tag }>`, 'g'), ''), body)
    .replace(/<\/?[a-z-]+>/g, '')
    .trim();
}

/**
 * Ask `agent` one question.
 *
 * Resolves with the agent's answer, or rejects with a readable error. `onDelta` (optional) is
 * called with the answer so far, so a caller can show it arriving.
 */
export function askAgent({
  agent, prompt, onDelta, timeout = 120000
}) {
  return new Promise((resolve, reject) => {
    let socket;
    let stream = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch (e) { /* already closing */ }
      fn(value);
    };

    const timer = setTimeout(() => finish(reject, new Error('The AI agent did not answer in time.')), timeout);

    const onFrame = (raw) => {
      stream += `${ raw }`;

      const errorTag = ERROR_TAGS.find((tag) => stream.includes(tag));

      if (errorTag) {
        finish(reject, new Error(stream.split(errorTag)[1]?.replace(/<[^>]+>/g, '').trim() || 'The AI agent reported an error.'));

        return;
      }

      // Complete at </message> — the socket stays open for a next question that never comes.
      if (stream.includes(MESSAGE_END)) {
        const answer = answerFrom(stream);

        finish(answer ? resolve : reject, answer || new Error('The AI agent answered with nothing.'));

        return;
      }

      onDelta?.(answerFrom(stream));
    };

    try {
      socket = new WebSocket(wsUrl());
    } catch (e) {
      finish(reject, new Error('Could not reach the AI agent.'));

      return;
    }

    socket.onopen = () => socket.send(JSON.stringify({
      prompt, agent, context: {}
    }));
    socket.onmessage = (ev) => onFrame(ev.data);
    socket.onerror = () => finish(reject, new Error('Connection error talking to the AI agent.'));
    socket.onclose = () => finish(reject, new Error('The AI agent closed without answering.'));
  });
}

/**
 * Pull the first JSON object out of an agent's reply. Agents like to wrap JSON in a ```json fence
 * or a sentence of explanation, so take the outermost braces rather than trusting the whole reply
 * to parse.
 */
export function extractJson(text) {
  const body = `${ text || '' }`.replace(/```(?:json)?/gi, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}
