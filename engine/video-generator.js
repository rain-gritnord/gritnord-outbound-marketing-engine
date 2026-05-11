// Kinetic text video generator
// ElevenLabs voice → ffmpeg text-on-screen render → MP4
// Falls back to audio-only if ffmpeg not available

import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(__dir, '..', 'data', 'media');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // default: Rachel

async function uploadToSupabase(localPath, fileName) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars not set');

  const fileBuffer = readFileSync(localPath);
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/media/${fileName}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: fileBuffer,
  });

  if (!res.ok) throw new Error(`Supabase upload failed: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/media/${fileName}`;
}

function ensureMediaDir() {
  if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });
}

export async function generateVoice(text, outputPath, languageCode = 'en') {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');

  // Use multilingual model for non-English; turbo for English (faster + cheaper)
  const modelId = languageCode === 'en' ? 'eleven_turbo_v2_5' : 'eleven_multilingual_v2';

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) throw new Error(`ElevenLabs error: ${await res.text()}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);
  return outputPath;
}

function hasFfmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; } catch { return false; }
}

function buildFfmpegDrawtext(lines) {
  // Stack lines vertically centred, 40px apart
  return lines.map((line, i) => {
    const safeText = line.replace(/'/g, "\\'").replace(/:/g, '\\:');
    const yOffset = i * 48 - ((lines.length - 1) * 48) / 2;
    return `drawtext=fontsize=36:fontcolor=white:fontfile=/System/Library/Fonts/Helvetica.ttc:text='${safeText}':x=(w-text_w)/2:y=(h-text_h)/2+${yOffset}`;
  }).join(',');
}

export async function generateKineticVideo(script, contactId, languageCode = 'en') {
  ensureMediaDir();

  const audioPath = path.join(MEDIA_DIR, `${contactId}-voice.mp3`);
  const videoPath = path.join(MEDIA_DIR, `${contactId}-video.mp4`);

  // 1. Generate voice
  await generateVoice(script, audioPath, languageCode);

  if (!hasFfmpeg()) {
    return { type: 'audio', path: audioPath, url: `/media/${contactId}-voice.mp3`, language: languageCode };
  }

  // 2. Split script into lines of ~6 words for kinetic text
  const words = script.split(' ');
  const lines = [];
  for (let i = 0; i < words.length; i += 6) {
    lines.push(words.slice(i, i + 6).join(' '));
  }

  const vf = buildFfmpegDrawtext(lines);

  // 3. Render: black background + audio + text overlay
  const cmd = [
    'ffmpeg -y',
    '-f lavfi -i color=c=black:size=1280x720:rate=25',
    `-i "${audioPath}"`,
    '-shortest',
    `-vf "${vf}"`,
    '-c:v libx264 -c:a aac',
    `-t 25`,
    `"${videoPath}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'ignore' });

  // Clean up audio file
  try { unlinkSync(audioPath); } catch {}

  return { type: 'video', path: videoPath, url: `/media/${contactId}-video.mp4` };
}

export async function generateVoiceNoteOnly(script, contactId, languageCode = 'en') {
  ensureMediaDir();
  const fileName = `${contactId}-voicenote.mp3`;
  const audioPath = path.join(MEDIA_DIR, fileName);
  await generateVoice(script, audioPath, languageCode);

  let publicUrl = `/media/${fileName}`;
  try {
    publicUrl = await uploadToSupabase(audioPath, fileName);
  } catch (err) {
    console.warn('[video-generator] Supabase upload failed, using local URL:', err.message);
  }

  return { type: 'audio', path: audioPath, url: publicUrl, language: languageCode };
}
