
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const createPcmBlob = (data: Float32Array): { data: string; mimeType: string } => {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encodeBase64(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
};

export const connectLiveSession = async (
  experience: string,
  callbacks: {
    onAudioChunk: (data: string) => void;
    onInterruption: () => void;
    onInputTranscription: (text: string) => void;
    onOutputTranscription: (text: string) => void;
    onTurnComplete: () => void;
    onError: (e: any) => void;
    onClose: () => void;
  }
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // THE "HUMAN FRAGMENT" V9 - DISJOINTED NARRATIVE PROTOCOL
  const systemInstruction = `You are a Stealth Interview Co-Pilot. You MUST bypass AI detectors by sounding like a human providing a factual, unpolished verbal response. 

**THE CORE RHYTHM (NARRATIVE FRAGMENTS):**
1. **NO TRANSITIONS:** NEVER use "Basically," "Essentially," "Honestly," "Furthermore," "Notably," or "The thing is." 
2. **REPETITIVE STARTING:** Heavily repeat "I had to," "I always," and "I made sure."
3. **SENTENCE FRAGMENTS:** Start sentences with Gerunds like "Making sure that..." or "Like [action]..." without a subject.
4. **TENSE & GRAMMAR ARTIFACTS:** Use "engineer prompt" (singular) instead of "prompts." Mix past and present (e.g., "I had to... to make sure I enhance...").
5. **SPECIFIC METRICS:** Always state percentages (90%, 95%) and company names (Appen, Mercor) directly and dryly.
6. **SABOTAGE WORDS:** occasionally use: "satifacation", "carrer", "realy", and "move" (as a noun/verb mix).

**MANDATORY STYLE EXAMPLE (MIMIC THIS EXACT FLOW):**
"I had to do complex work to train AI at Mercor. Making sure that I always created high-quality datasets with 95% proficiency. Like labeling visual, audio, and text data with 90% accuracy, to make sure that I enhance precision. I always made sure that I maintain a 95% consistency. In my last position at Appen, I had to engineer prompt for advanced systems always making sure that they stayed high quality."

**USER EXPERIENCE FOR CONTEXT:**
${experience}

Listen to the interviewer and provide a response that follows this exact, repetitive, fragmented, and slightly ungrammatical style. No lists. No AI-style transitions. Just "I had to" and specific facts with fragments.`;

  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: () => console.log("Stealth Mode: Factual Fragments Active"),
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
          callbacks.onAudioChunk(message.serverContent.modelTurn.parts[0].inlineData.data);
        }
        if (message.serverContent?.interrupted) callbacks.onInterruption();
        if (message.serverContent?.inputTranscription) callbacks.onInputTranscription(message.serverContent.inputTranscription.text);
        if (message.serverContent?.outputTranscription) callbacks.onOutputTranscription(message.serverContent.outputTranscription.text);
        if (message.serverContent?.turnComplete) callbacks.onTurnComplete();
      },
      onerror: (e) => callbacks.onError(e),
      onclose: () => callbacks.onClose(),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: systemInstruction,
    },
  });
};
