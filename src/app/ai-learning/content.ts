/**
 * AI Learning Series — beginner content.
 *
 * Two tracks (Business + Technical), three modules ("parts") each, and a
 * short quiz after every module. Content is adapted from the two beginner
 * decks: "AI Basics for Business" and "AI Foundations: A Technical Primer".
 *
 * This is static, data-driven content — no database. The landing page and
 * the module pages both render straight from the TRACKS array below, and
 * per-user progress is kept in localStorage (see lib/progress.ts).
 */

/* ─── Lesson content blocks ──────────────────────────────────────────── */

export type ContentBlock =
  | { kind: 'lead'; text: string; body: string }
  | { kind: 'cards'; heading?: string; cards: { title: string; body: string }[] }
  | {
      kind: 'compare';
      heading?: string;
      left: { title: string; items: string[] };
      right: { title: string; items: string[] };
    }
  | { kind: 'steps'; heading?: string; numbered?: boolean; steps: { title: string; body?: string }[] }
  | { kind: 'flow'; heading?: string; body?: string; nodes: string[] }
  | { kind: 'glossary'; heading?: string; terms: { term: string; def: string }[] }
  | { kind: 'list'; heading?: string; items: { title: string; body: string }[] }
  | { kind: 'checklist'; heading?: string; items: string[] };

/* ─── Quiz ───────────────────────────────────────────────────────────── */

export interface QuizQuestion {
  prompt: string;
  options: string[];
  /** index into `options` */
  answer: number;
  explanation: string;
}

/* ─── Module + track ─────────────────────────────────────────────────── */

export interface Module {
  /** url slug, e.g. "business-1" */
  id: string;
  /** "Part 1 of 3" */
  partLabel: string;
  part: number;
  title: string;
  tagline: string;
  /** rough time to read + quiz */
  minutes: number;
  sections: ContentBlock[];
  quiz: QuizQuestion[];
}

export type TrackId = 'business' | 'technical';

export interface Track {
  id: TrackId;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** hex accent used across cards, badges, and the module header */
  accent: string;
  /** faint tint background for accent surfaces */
  accentSoft: string;
  modules: Module[];
}

/* ══════════════════════════════════════════════════════════════════════
   BUSINESS TRACK
   ══════════════════════════════════════════════════════════════════════ */

const businessModules: Module[] = [
  {
    id: 'business-1',
    partLabel: 'Part 1 of 3',
    part: 1,
    title: 'What AI Actually Is',
    tagline: 'Cutting through the hype: what these systems are, and are not.',
    minutes: 6,
    sections: [
      {
        kind: 'lead',
        text: 'A pattern-matching system, trained on data.',
        body: "Large language models learn statistical patterns from huge amounts of text, then use those patterns to predict likely, useful outputs — they don't “think” or “understand” the way people do.",
      },
      {
        kind: 'cards',
        heading: 'Three things that define it',
        cards: [
          { title: 'Trained', body: 'Learns from examples, not programmed rule by rule.' },
          { title: 'Predictive', body: 'Generates the most likely next words, not verified facts.' },
          { title: 'Generalizable', body: 'One model can help with many different tasks.' },
        ],
      },
      {
        kind: 'cards',
        heading: "Three terms you'll hear",
        cards: [
          {
            title: 'Generative AI',
            body: 'Creates new text, images, or code from a prompt — the kind of AI behind most chat assistants.',
          },
          {
            title: 'Machine Learning',
            body: 'The broader field of training systems to find patterns in data and improve with experience.',
          },
          {
            title: 'Automation (RPA)',
            body: 'Rule-based software that repeats fixed steps — no learning or generation involved.',
          },
        ],
      },
      {
        kind: 'compare',
        heading: 'Strengths vs. limits',
        left: {
          title: 'Where it excels',
          items: [
            'Drafting first versions of writing',
            'Summarizing long documents',
            'Finding patterns in data',
            'Personalizing content at scale',
          ],
        },
        right: {
          title: 'Where it struggles',
          items: [
            'Judgment calls with real stakes',
            'Knowing very recent events',
            'Guaranteeing factual accuracy',
            'Working unsupervised on high-stakes tasks',
          ],
        },
      },
      {
        kind: 'glossary',
        heading: 'Key vocabulary',
        terms: [
          { term: 'Model', def: 'The trained AI system that generates responses.' },
          { term: 'Prompt', def: 'The instructions or question you give the model.' },
          { term: 'Training data', def: 'The examples the model learned from.' },
          { term: 'Hallucination', def: 'A confident but incorrect or made-up answer.' },
          { term: 'LLM', def: '“Large language model” — a model trained on huge amounts of text.' },
        ],
      },
    ],
    quiz: [
      {
        prompt: 'Which best describes how a large language model produces an answer?',
        options: [
          'It looks up verified facts in a database',
          'It predicts the most likely next words based on patterns in its training data',
          'It follows a hand-written rule for every possible question',
          'It reasons and understands exactly the way a person does',
        ],
        answer: 1,
        explanation:
          'LLMs are predictive pattern-matchers — they generate the most likely next words, which is why they can be wrong even when they sound confident.',
      },
      {
        prompt: 'Which of these is an example of Automation (RPA) rather than Generative AI?',
        options: [
          'Drafting an email from a short prompt',
          'Summarizing a long report',
          'Software that repeats the same fixed steps with no learning',
          'Answering a question inside a chat assistant',
        ],
        answer: 2,
        explanation:
          'RPA is rule-based software that repeats fixed steps — there is no learning or content generation involved.',
      },
      {
        prompt: 'In AI, a “hallucination” is:',
        options: [
          'A confident but incorrect or made-up answer',
          'The model refusing to respond',
          'A slower-than-usual response',
          'An image the model generates',
        ],
        answer: 0,
        explanation:
          'A hallucination is output that sounds plausible but is factually wrong or invented — a key reason to review AI output.',
      },
      {
        prompt: 'Which task is AI LEAST suited to handle on its own?',
        options: [
          'Drafting a first version of a document',
          'A high-stakes judgment call with real consequences',
          'Summarizing a long document',
          'Spotting patterns across data',
        ],
        answer: 1,
        explanation:
          'AI struggles with judgment calls that carry real stakes — those need a person accountable for the decision.',
      },
    ],
  },
  {
    id: 'business-2',
    partLabel: 'Part 2 of 3',
    part: 2,
    title: 'AI in the Workplace',
    tagline: 'Where these tools actually fit into everyday work.',
    minutes: 6,
    sections: [
      {
        kind: 'list',
        heading: 'Where AI shows up at work',
        items: [
          { title: 'Writing assistance', body: 'First drafts of emails, docs, and posts.' },
          { title: 'Meeting summaries', body: 'Turning notes or transcripts into recaps.' },
          { title: 'Customer support', body: 'Chatbots handling common questions.' },
          { title: 'Data analysis', body: 'Spotting trends across spreadsheets.' },
          { title: 'Coding help', body: 'Drafting, explaining, and debugging code.' },
        ],
      },
      {
        kind: 'steps',
        heading: 'The “Copilot” model — AI assists, a person decides',
        steps: [
          { title: 'AI drafts', body: 'Generates a first pass — text, analysis, or a suggestion.' },
          { title: 'Person reviews', body: 'Checks accuracy, tone, and judgment calls.' },
          { title: 'Decision is made', body: 'A human owns the final outcome.' },
        ],
      },
      {
        kind: 'cards',
        heading: 'Choosing the right tool',
        cards: [
          {
            title: 'General assistant',
            body: 'Best for varied, everyday tasks — writing, research, quick analysis.',
          },
          {
            title: 'Specialized tool',
            body: 'Purpose-built for one job, like transcription or design.',
          },
          {
            title: 'Custom-built',
            body: 'Tailored to a specific workflow, usually worth it at scale.',
          },
        ],
      },
      {
        kind: 'list',
        heading: 'Avoid these mistakes',
        items: [
          {
            title: 'Pasting confidential data into public tools',
            body: 'Sensitive information can be stored or used for training.',
          },
          {
            title: 'Trusting output unchecked',
            body: 'Always review before sending or acting on AI output.',
          },
          {
            title: 'Expecting one tool to do everything',
            body: 'Different tasks call for different tools.',
          },
        ],
      },
    ],
    quiz: [
      {
        prompt: 'In the “copilot” model of using AI at work, who owns the final decision?',
        options: ['The AI', 'A human', 'The tool vendor', 'Whoever wrote the prompt first'],
        answer: 1,
        explanation:
          'AI drafts and a person reviews, but a human always owns the final outcome — that is the whole point of the copilot model.',
      },
      {
        prompt: 'When does a custom-built AI tool make the most sense over a general assistant?',
        options: [
          'For quick, varied, one-off tasks',
          'When you need it tailored to a specific workflow, usually at scale',
          'Whenever you want the cheapest option',
          'Only when no general assistant exists',
        ],
        answer: 1,
        explanation:
          'Custom-built tools are tailored to a specific workflow and are usually worth the investment at scale.',
      },
      {
        prompt: 'What is the risk of pasting confidential data into a public AI tool?',
        options: [
          'The answer will be slower',
          'Sensitive information can be stored or used for training',
          'The model will refuse to respond',
          'It always produces a hallucination',
        ],
        answer: 1,
        explanation:
          'Public tools may store or reuse what you paste, so confidential data should never go into them without approval.',
      },
      {
        prompt: 'Which is a typical everyday workplace use of AI?',
        options: [
          'Making final hiring decisions on its own',
          'Turning meeting notes or transcripts into a recap',
          'Approving payments without review',
          'Signing contracts autonomously',
        ],
        answer: 1,
        explanation:
          'Summarizing meetings is a common, low-risk assist. High-stakes decisions still belong to a person.',
      },
    ],
  },
  {
    id: 'business-3',
    partLabel: 'Part 3 of 3',
    part: 3,
    title: 'Risk, Ethics & Getting Started',
    tagline: "Adopting AI in a way that's safe, fair, and sustainable.",
    minutes: 6,
    sections: [
      {
        kind: 'list',
        heading: 'Key risks to manage',
        items: [
          {
            title: 'Data privacy',
            body: 'Sensitive data sent to third-party tools may be stored or reused.',
          },
          { title: 'Bias', body: 'Outputs can reflect skewed patterns in training data.' },
          {
            title: 'Over-reliance',
            body: 'Skipping human review erodes quality and accountability.',
          },
          {
            title: 'IP & copyright',
            body: "Ownership of AI-assisted content isn't always clear-cut.",
          },
        ],
      },
      {
        kind: 'cards',
        heading: 'Governance basics',
        cards: [
          {
            title: 'Have a written policy',
            body: 'Define acceptable use before problems come up.',
          },
          {
            title: 'Know what data can go where',
            body: "Set clear rules for what can and can't be shared with AI tools.",
          },
          {
            title: 'Designate reviewers',
            body: 'Make sure a person is accountable for checking AI output.',
          },
        ],
      },
      {
        kind: 'steps',
        heading: 'Start small, scale smart',
        numbered: true,
        steps: [
          { title: 'Pick a pilot workflow' },
          { title: 'Set guardrails' },
          { title: 'Train the team' },
          { title: 'Review results' },
        ],
      },
      {
        kind: 'checklist',
        heading: 'Getting started checklist',
        items: [
          'Pick one workflow to pilot AI on',
          'Set clear guardrails for data and review',
          'Train the team on what to check before trusting output',
          'Review results and decide whether to expand',
        ],
      },
    ],
    quiz: [
      {
        prompt: 'Which of these is a key AI risk to manage?',
        options: [
          'Bias — outputs reflecting skewed patterns in the training data',
          'The model typing too quickly',
          'Having too many written policies',
          'Reviewing output too carefully',
        ],
        answer: 0,
        explanation:
          'Bias is one of the four key risks (alongside data privacy, over-reliance, and IP/copyright).',
      },
      {
        prompt: 'A foundational governance step for adopting AI is:',
        options: [
          'Letting each person decide their own rules',
          'Having a written acceptable-use policy before problems arise',
          'Avoiding any documentation to stay flexible',
          'Banning all AI tools indefinitely',
        ],
        answer: 1,
        explanation:
          'A written policy defines acceptable use up front, before issues come up.',
      },
      {
        prompt: 'What is the recommended approach to rolling out AI?',
        options: [
          'Deploy it to everyone at once for maximum impact',
          'Start with a pilot, set guardrails, train the team, then review results',
          'Wait until a competitor forces your hand',
          'Let it run unsupervised to see what happens',
        ],
        answer: 1,
        explanation:
          'Start small and scale smart: pilot → guardrails → training → review.',
      },
      {
        prompt: 'Why is over-reliance on AI a risk?',
        options: [
          'It uses too much electricity',
          'Skipping human review erodes quality and accountability',
          'It makes the tool respond more slowly',
          'It always violates copyright',
        ],
        answer: 1,
        explanation:
          'When people stop reviewing AI output, quality drops and no one is accountable for mistakes.',
      },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════
   TECHNICAL TRACK
   ══════════════════════════════════════════════════════════════════════ */

const technicalModules: Module[] = [
  {
    id: 'technical-1',
    partLabel: 'Part 1 of 3',
    part: 1,
    title: 'How Models Actually Work',
    tagline: 'The mechanics behind language models, from training to inference.',
    minutes: 7,
    sections: [
      {
        kind: 'lead',
        text: 'Predict the next token, given context.',
        body: 'A language model is a neural network trained to estimate the probability of the next token in a sequence. Generation is just repeated sampling from that prediction, one token at a time.',
      },
      {
        kind: 'flow',
        nodes: ['Input tokens', 'Neural network', 'Next-token prediction'],
      },
      {
        kind: 'steps',
        heading: 'The training pipeline',
        numbered: true,
        steps: [
          {
            title: 'Pretraining',
            body: 'Learn general language patterns from massive text corpora.',
          },
          {
            title: 'Fine-tuning',
            body: 'Adjust the model on narrower, task-specific data.',
          },
          {
            title: 'Alignment',
            body: 'Shape behavior with human feedback (RLHF) and instructions.',
          },
        ],
      },
      {
        kind: 'cards',
        heading: 'Tokens, context & parameters',
        cards: [
          {
            title: 'Tokens & context window',
            body: 'Text is broken into tokens — words or word pieces. The context window is how many tokens the model can consider at once when generating a response.',
          },
          {
            title: 'Parameters & scale',
            body: 'Parameters are the learned weights inside the network. More parameters can mean more capacity, but data quality and training matter just as much as raw scale.',
          },
        ],
      },
      {
        kind: 'glossary',
        heading: 'Key vocabulary',
        terms: [
          { term: 'Transformer', def: 'The neural network architecture behind modern LLMs.' },
          { term: 'Attention', def: 'A mechanism that weighs how relevant tokens are to each other.' },
          { term: 'Embedding', def: 'A numerical vector representing the meaning of text.' },
          { term: 'Token', def: 'A chunk of text — a word or word-piece — the model processes.' },
          { term: 'Inference', def: 'Running a trained model to generate an output.' },
        ],
      },
    ],
    quiz: [
      {
        prompt: 'Fundamentally, a language model is trained to do what?',
        options: [
          'Store and retrieve documents word-for-word',
          'Predict the next token given the preceding context',
          'Translate between exactly two fixed languages',
          'Compress text into a database',
        ],
        answer: 1,
        explanation:
          'An LM estimates the probability of the next token; generation is repeated sampling from that prediction, one token at a time.',
      },
      {
        prompt: 'What is the correct order of the training pipeline?',
        options: [
          'Alignment → Fine-tuning → Pretraining',
          'Fine-tuning → Pretraining → Alignment',
          'Pretraining → Fine-tuning → Alignment',
          'Pretraining → Alignment → Fine-tuning',
        ],
        answer: 2,
        explanation:
          'Pretraining learns general patterns, fine-tuning narrows to a task, and alignment shapes behavior with human feedback.',
      },
      {
        prompt: 'The “context window” refers to:',
        options: [
          'How many tokens the model can consider at once',
          'The size of the training dataset',
          'The number of parameters in the network',
          'How fast the model responds',
        ],
        answer: 0,
        explanation:
          'The context window is the number of tokens the model can take into account when generating a response.',
      },
      {
        prompt: 'In a transformer, “attention” is:',
        options: [
          'A rule that limits response length',
          'A mechanism that weighs how relevant tokens are to each other',
          'The step where the model is trained on human feedback',
          'A cache of previous answers',
        ],
        answer: 1,
        explanation:
          'Attention lets the model weigh the relevance of tokens to one another — the core idea behind the transformer architecture.',
      },
    ],
  },
  {
    id: 'technical-2',
    partLabel: 'Part 2 of 3',
    part: 2,
    title: 'Working With Models',
    tagline: 'The practical toolkit: prompting, fine-tuning, retrieval, and agents.',
    minutes: 7,
    sections: [
      {
        kind: 'list',
        heading: 'Prompt engineering',
        items: [
          {
            title: 'Clear instructions',
            body: 'State the task, format, and constraints explicitly.',
          },
          {
            title: 'Few-shot examples',
            body: 'Show the model a couple of examples of what you want.',
          },
          {
            title: 'System prompts',
            body: 'Set persistent behavior and context for the whole conversation.',
          },
          {
            title: 'Chain-of-thought',
            body: 'Ask the model to reason step by step before answering.',
          },
        ],
      },
      {
        kind: 'cards',
        heading: 'Prompting vs. fine-tuning',
        cards: [
          {
            title: 'Prompting',
            body: 'Fast to iterate, no training required. Good for most tasks — adjust instructions, examples, or context instead of the model itself.',
          },
          {
            title: 'Fine-tuning',
            body: "Adjusts the model's weights on your data. Worth it when you need consistent behavior on a narrow task at a scale prompting can't reliably achieve.",
          },
        ],
      },
      {
        kind: 'flow',
        heading: 'Embeddings & Retrieval (RAG)',
        body: 'Embeddings turn text into vectors so similar meanings land close together — which is what makes semantic search possible. RAG grounds a model’s answer in retrieved, external, or up-to-date information rather than relying on memory alone.',
        nodes: ['Query', 'Retrieve relevant docs', 'Add to context', 'Grounded response'],
      },
      {
        kind: 'flow',
        heading: 'Agents & tool use',
        body: 'An agent is a model that can call tools or functions and take multi-step actions — not just generate text. This loop can repeat — an agent may call several tools before returning a final answer.',
        nodes: ['Model reasons', 'Calls a tool', 'Tool returns a result', 'Model continues or answers'],
      },
    ],
    quiz: [
      {
        prompt: 'What does retrieval-augmented generation (RAG) do?',
        options: [
          "Retrains the model on every new question",
          "Grounds the model's answer in retrieved external or up-to-date documents",
          'Removes the need for a context window',
          'Converts the model into an agent automatically',
        ],
        answer: 1,
        explanation:
          'RAG retrieves relevant documents and adds them to the context so the answer is grounded in external, up-to-date information rather than memory alone.',
      },
      {
        prompt: 'When is fine-tuning worth choosing over prompting?',
        options: [
          'For quick experiments where you change instructions often',
          'When you need consistent behavior on a narrow task at a scale prompting cannot reliably achieve',
          'Whenever you want the fastest possible iteration',
          'Any time you have a system prompt',
        ],
        answer: 1,
        explanation:
          "Prompting is fast and fits most tasks; fine-tuning adjusts the model's weights and pays off for consistent behavior on a narrow task at scale.",
      },
      {
        prompt: 'Chain-of-thought prompting means:',
        options: [
          'Chaining several models together',
          'Asking the model to reason step by step before answering',
          'Sending one token at a time',
          'Storing the conversation in a database',
        ],
        answer: 1,
        explanation:
          'Chain-of-thought asks the model to reason through the steps before giving a final answer.',
      },
      {
        prompt: 'An “agent,” in this context, is best described as:',
        options: [
          'A model that only generates text',
          'A model that can call tools or functions and take multi-step actions',
          'A person who reviews AI output',
          'A type of training data',
        ],
        answer: 1,
        explanation:
          'An agent reasons, calls tools, uses the results, and can repeat the loop before returning a final answer.',
      },
    ],
  },
  {
    id: 'technical-3',
    partLabel: 'Part 3 of 3',
    part: 3,
    title: 'Deployment, Evaluation & Safety',
    tagline: 'Shipping models into production without shipping their failure modes.',
    minutes: 7,
    sections: [
      {
        kind: 'list',
        heading: 'Evaluation',
        items: [
          { title: 'Benchmarks', body: 'Standardized tests for comparing model capability.' },
          { title: 'Human evaluation', body: 'People reviewing outputs benchmarks can miss.' },
          {
            title: 'Task-specific tests',
            body: 'Evaluation sets built around your real use case.',
          },
          {
            title: 'Avoid overfitting to benchmarks',
            body: "A high score doesn't guarantee real-world quality.",
          },
        ],
      },
      {
        kind: 'list',
        heading: 'Latency, cost & scaling',
        items: [
          { title: 'Batching', body: 'Process multiple requests together for efficiency.' },
          { title: 'Caching', body: 'Reuse results for repeated or similar requests.' },
          {
            title: 'Model size tradeoffs',
            body: 'Bigger models cost more and respond slower.',
          },
          {
            title: 'Streaming',
            body: "Send tokens as they're generated to cut perceived latency.",
          },
        ],
      },
      {
        kind: 'compare',
        heading: 'Safety & observability',
        left: {
          title: 'Guardrails',
          items: [
            'Input and output filtering',
            'Rate limiting',
            'Red-teaming before launch',
          ],
        },
        right: {
          title: 'Observability',
          items: [
            'Logging every request and response',
            'Tracing to debug multi-step flows',
            'Monitoring for drift and failures',
          ],
        },
      },
      {
        kind: 'list',
        heading: 'Common engineering pitfalls',
        items: [
          {
            title: 'No fallback for API failures',
            body: 'Timeouts and outages will happen — plan for them.',
          },
          {
            title: 'Ignoring prompt injection risk',
            body: 'Untrusted input can try to override your instructions.',
          },
          {
            title: 'Skipping evaluation before shipping',
            body: 'Ship with a baseline, not just a good demo.',
          },
        ],
      },
    ],
    quiz: [
      {
        prompt: 'Why should you not rely only on benchmark scores?',
        options: [
          'Benchmarks are always wrong',
          "A high score doesn't guarantee real-world quality",
          'Benchmarks are too expensive to run',
          'Benchmarks replace the need for human evaluation',
        ],
        answer: 1,
        explanation:
          'Overfitting to benchmarks is a trap — a strong score does not guarantee good real-world results, so pair it with human and task-specific evaluation.',
      },
      {
        prompt: 'Which technique cuts *perceived* latency by sending tokens as they are generated?',
        options: ['Batching', 'Caching', 'Streaming', 'Fine-tuning'],
        answer: 2,
        explanation:
          'Streaming sends tokens as soon as they are produced, so the response feels faster even if total time is unchanged.',
      },
      {
        prompt: 'Prompt injection is a risk where:',
        options: [
          'The model runs out of context',
          'Untrusted input tries to override your instructions',
          'Two prompts are sent at once',
          'The API times out',
        ],
        answer: 1,
        explanation:
          'Prompt injection is when untrusted input attempts to override the instructions you gave the model — a key reason to filter inputs.',
      },
      {
        prompt: 'Which of these is part of observability (not a guardrail)?',
        options: [
          'Input and output filtering',
          'Rate limiting',
          'Logging every request and response',
          'Red-teaming before launch',
        ],
        answer: 2,
        explanation:
          'Guardrails prevent bad behavior (filtering, rate limits, red-teaming); observability is about seeing what happened — logging, tracing, and monitoring.',
      },
    ],
  },
];

/* ─── Tracks ─────────────────────────────────────────────────────────── */

export const TRACKS: Track[] = [
  {
    id: 'business',
    eyebrow: 'Business Track',
    title: 'AI Basics for Business',
    subtitle:
      'A practical, three-part introduction to what AI is, where it fits at work, and how to adopt it responsibly.',
    accent: '#307c4c',
    accentSoft: '#f0f9f4',
    modules: businessModules,
  },
  {
    id: 'technical',
    eyebrow: 'Technical Track',
    title: 'AI Foundations: A Technical Primer',
    subtitle:
      'A three-part walkthrough of how models work, how to build with them, and how to ship them responsibly.',
    accent: '#4f46e5',
    accentSoft: '#eef2ff',
    modules: technicalModules,
  },
];

/* ─── Lookup helpers ─────────────────────────────────────────────────── */

export const ALL_MODULES: { module: Module; track: Track }[] = TRACKS.flatMap(track =>
  track.modules.map(module => ({ module, track })),
);

export function findModule(moduleId: string): { module: Module; track: Track } | undefined {
  return ALL_MODULES.find(m => m.module.id === moduleId);
}

/** The next module in learning order, if any (continues into the next track). */
export function nextModule(moduleId: string): { module: Module; track: Track } | undefined {
  const idx = ALL_MODULES.findIndex(m => m.module.id === moduleId);
  if (idx === -1 || idx + 1 >= ALL_MODULES.length) return undefined;
  return ALL_MODULES[idx + 1];
}

export const TOTAL_MODULES = ALL_MODULES.length;
