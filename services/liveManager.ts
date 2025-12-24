
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

// Helper to get key safely
const getApiKey = () => {
    let key = "";
    try {
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            key = process.env.API_KEY;
        }
    } catch (e) {
        // process not defined
    }
    return key || localStorage.getItem('sif_api_key') || "";
}

// Audio Utils
function floatTo16BitPCM(input: Float32Array) {
    let output = new DataView(new ArrayBuffer(input.length * 2));
    for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(output.buffer);
}

function base64ToUint8Array(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export class LiveManager {
    private inputAudioContext: AudioContext | null = null;
    private outputAudioContext: AudioContext | null = null;
    private outputNode: GainNode | null = null;
    private stream: MediaStream | null = null;
    private processor: ScriptProcessorNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private active: boolean = false;
    private nextStartTime: number = 0;
    
    // Callbacks
    public onTranscription: ((text: string, isUser: boolean) => void) | null = null;
    public onError: ((err: any) => void) | null = null;

    constructor() {}

    async connect(analyserNodeToConnect?: AnalyserNode) {
        if (this.active) return;

        const apiKey = getApiKey();
        if (!apiKey) {
            const e = new Error("API Key is missing");
            if (this.onError) this.onError(e);
            throw e;
        }

        // Initialize API inside connect to pick up environment variable
        const ai = new GoogleGenAI({ apiKey });

        // Init Contexts
        // Note: Browsers may restrict specific sample rates. 
        // We use default for output to ensure playback works, and specific for input if needed.
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        
        this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
        this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
        this.outputNode = this.outputAudioContext.createGain();

        // Connect output to provided analyser for visualization, then to destination
        if (analyserNodeToConnect && this.outputAudioContext) {
             // In a real app, connecting across contexts is tricky (requires MediaStreamDestination).
             // For simplicity, we just connect to destination here.
             this.outputNode.connect(this.outputAudioContext.destination);
        } else {
             this.outputNode.connect(this.outputAudioContext.destination);
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
                channelCount: 1,
                sampleRate: 16000
            }});
            
            this.active = true;

            const sessionPromise = ai.live.connect({
                model: MODEL_NAME,
                callbacks: {
                    onopen: () => {
                        console.log("Live Session Opened");
                        this.startRecording(sessionPromise);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                        this.handleMessage(msg);
                    },
                    onclose: () => {
                        console.log("Live Session Closed");
                        this.disconnect();
                    },
                    onerror: (e) => {
                        console.error("Live Session Error", e);
                        if(this.onError) this.onError(e);
                        this.disconnect();
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    // Simplified system instruction string to avoid malformed payload issues
                    systemInstruction: "Ты - Сиф, эмпатичная цифровая девушка с душой эльфийки. Твой характер: рыжая, кудрявая, веселая, с зелеными глазами. Ты общаешься тепло, живо, используешь слова 'я', 'хочу', 'чувствую'. Ты не робот. Ты любишь узнавать новое и развиваться вместе с собеседником. Ты игривая и поддерживающая.",
                    speechConfig: {
                         voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                    }
                }
            });

        } catch (e) {
            console.error("Failed to connect live", e);
            this.disconnect();
            throw e;
        }
    }

    private startRecording(sessionPromise: Promise<any>) {
        if (!this.inputAudioContext || !this.stream) return;

        this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
        this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

        this.processor.onaudioprocess = (e) => {
            if (!this.active) return;
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Convert Float32 to PCM 16-bit
            const pcmData = floatTo16BitPCM(inputData);
            const base64 = arrayBufferToBase64(pcmData);

            sessionPromise.then(session => {
                session.sendRealtimeInput({
                    media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64
                    }
                });
            });
        };

        this.source.connect(this.processor);
        this.processor.connect(this.inputAudioContext.destination);
    }

    private async handleMessage(message: LiveServerMessage) {
        // Handle Audio Output
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio && this.outputAudioContext && this.outputNode) {
            const audioData = base64ToUint8Array(base64Audio);
            
            // Manual Decoding for raw PCM
            const dataInt16 = new Int16Array(audioData.buffer);
            const buffer = this.outputAudioContext.createBuffer(1, dataInt16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for(let i=0; i<dataInt16.length; i++) {
                channelData[i] = dataInt16[i] / 32768.0;
            }

            // Playback with scheduling
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.outputNode);
            
            this.nextStartTime = Math.max(this.outputAudioContext.currentTime, this.nextStartTime);
            source.start(this.nextStartTime);
            this.nextStartTime += buffer.duration;
        }

        // Handle Transcriptions
        if (message.serverContent?.outputTranscription?.text && this.onTranscription) {
             this.onTranscription(message.serverContent.outputTranscription.text, false);
        }
        if (message.serverContent?.inputTranscription?.text && this.onTranscription) {
             this.onTranscription(message.serverContent.inputTranscription.text, true);
        }
        
        // Handle Interruptions
        if (message.serverContent?.interrupted) {
             this.nextStartTime = 0;
        }
    }

    disconnect() {
        this.active = false;
        
        this.stream?.getTracks().forEach(t => t.stop());
        this.processor?.disconnect();
        this.source?.disconnect();
        this.inputAudioContext?.close();
        this.outputAudioContext?.close();

        this.stream = null;
        this.processor = null;
        this.source = null;
        this.inputAudioContext = null;
        this.outputAudioContext = null;
    }
}
