import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';

export interface DialogExchange {
	speaker: 'A' | 'B';
	text: string;
}

export interface GenerateExchangeParams {
	topic: string;
	mode: 'interview' | 'smalltalk';
	previousExchanges: DialogExchange[];
	nextSpeaker: 'A' | 'B';
	hostAName: string;
	hostBName: string;
	signal?: AbortSignal;
}

function buildSystemMessage(params: GenerateExchangeParams): string {
	const { topic, mode, hostAName, hostBName } = params;

	if (mode === 'interview') {
		return `You are writing a podcast interview transcript.
Host A is "${hostAName}", the interviewer who asks insightful questions.
Host B is "${hostBName}", the expert who provides informative answers.
Topic: "${topic}".
Rules:
- Keep each exchange to 2-3 sentences maximum.
- Be conversational and natural.
- Host A asks focused questions. Host B gives clear, engaging answers.
- The dialogue should feel dynamic and interesting.`;
	}

	return `You are writing a casual podcast discussion transcript.
Host A is "${hostAName}". Host B is "${hostBName}".
Topic: "${topic}".
Rules:
- Keep each exchange to 2-3 sentences maximum.
- Be conversational and natural, like two friends chatting.
- Each host builds on what the other said.
- Each turn ends with a question, thought, or prompt for the other host.
- The dialogue should feel energetic and engaging.`;
}

function buildUserMessage(params: GenerateExchangeParams): string {
	const { previousExchanges, nextSpeaker } = params;

	if (previousExchanges.length === 0) {
		return `Start the conversation. The first speaker is Host ${nextSpeaker}.`;
	}

	const transcript = previousExchanges.map((e) => `Host ${e.speaker}: "${e.text}"`).join('\n');

	return `Previous conversation:\n${transcript}\n\nContinue the conversation. Next speaker: Host ${nextSpeaker}. Keep it brief and natural.`;
}

export async function generateExchange(params: GenerateExchangeParams): Promise<DialogExchange> {
	const { signal } = params;

	const response = await chatCompletions(
		{
			messages: [
				{ role: 'system', content: buildSystemMessage(params) },
				{ role: 'user', content: buildUserMessage(params) }
			],
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'exchange',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							speaker: { type: 'string', enum: ['A', 'B'] },
							text: { type: 'string' }
						},
						required: ['speaker', 'text'],
						additionalProperties: false
					}
				}
			},
			stream: false,
			temperature: 0.8
		},
		{ signal }
	);

	const text = response.choices?.[0]?.message?.content ?? '';
	const parsed = JSON.parse(text);

	const speaker = parsed.speaker === 'B' ? 'B' : 'A';
	const exchangeText = String(parsed.text ?? '').trim();

	if (!exchangeText) {
		throw new Error('Generated exchange has empty text');
	}

	return { speaker, text: exchangeText };
}
