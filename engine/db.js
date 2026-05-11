import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = {
  content:        path.join(DATA_DIR, 'content.json'),
  cycles:         path.join(DATA_DIR, 'cycles.json'),
  weights:        path.join(DATA_DIR, 'weights.json'),
  linkedinQueue:  path.join(DATA_DIR, 'linkedin-queue.json'),
  twitterQueue:   path.join(DATA_DIR, 'twitter-queue.json'),
  ucCandidates:   path.join(DATA_DIR, 'uc-candidates.json'),
  ucSequences:    path.join(DATA_DIR, 'uc-sequences.json'),
};

function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

function read(filePath, defaultData) {
  ensureFile(filePath, defaultData);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return defaultData;
  }
}

function write(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Content store
export function getAllContent() {
  return read(FILES.content, []);
}

export function getContentById(id) {
  return getAllContent().find(c => c.id === id) || null;
}

export function saveContent(item) {
  const all = getAllContent();
  const idx = all.findIndex(c => c.id === item.id);
  if (idx >= 0) all[idx] = item;
  else all.unshift(item);
  write(FILES.content, all);
  return item;
}

export function updateContent(id, updates) {
  const all = getAllContent();
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  write(FILES.content, all);
  return all[idx];
}

// Cycles store
export function getAllCycles() {
  return read(FILES.cycles, []);
}

export function saveCycle(cycle) {
  const all = getAllCycles();
  all.unshift(cycle);
  // Keep last 50 cycles
  write(FILES.cycles, all.slice(0, 50));
  return cycle;
}

// Weights store
const DEFAULT_WEIGHTS = {
  linkedin:          { priority: 1.0, successRate: 0.5, avgScore: 5 },
  twitter:           { priority: 1.0, successRate: 0.5, avgScore: 5 },
  seo_blog:          { priority: 1.0, successRate: 0.5, avgScore: 5 },
  ai_search:         { priority: 1.0, successRate: 0.5, avgScore: 5 },
  newsletter:        { priority: 1.0, successRate: 0.5, avgScore: 5 },
  cold_outreach:     { priority: 1.0, successRate: 0.5, avgScore: 5 },
  press_release:     { priority: 1.0, successRate: 0.5, avgScore: 5 },
  partnership_pitch: { priority: 1.0, successRate: 0.5, avgScore: 5 },
};

export function getWeights() {
  return read(FILES.weights, DEFAULT_WEIGHTS);
}

export function saveWeights(weights) {
  write(FILES.weights, weights);
  return weights;
}

// LinkedIn queue
export function getLinkedInQueue() {
  return read(FILES.linkedinQueue, []);
}

export function saveLinkedInDraft(post) {
  const all = getLinkedInQueue();
  all.unshift(post);
  write(FILES.linkedinQueue, all.slice(0, 100));
  return post;
}

export function updateLinkedInPost(id, updates) {
  const all = getLinkedInQueue();
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  write(FILES.linkedinQueue, all);
  return all[idx];
}

export function deleteLinkedInPost(id) {
  const all = getLinkedInQueue().filter(p => p.id !== id);
  write(FILES.linkedinQueue, all);
}

// Twitter queue
export function getTwitterQueue() {
  return read(FILES.twitterQueue, []);
}

export function saveTwitterDraft(post) {
  const all = getTwitterQueue();
  all.unshift(post);
  write(FILES.twitterQueue, all.slice(0, 100));
  return post;
}

export function updateTwitterPost(id, updates) {
  const all = getTwitterQueue();
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  write(FILES.twitterQueue, all);
  return all[idx];
}

export function deleteTwitterPost(id) {
  const all = getTwitterQueue().filter(p => p.id !== id);
  write(FILES.twitterQueue, all);
}

// ─── UC Candidates ────────────────────────────────────────────────────────────

export function getUCCandidates() {
  return read(FILES.ucCandidates, []);
}

export function saveUCCandidate(candidate) {
  const all = getUCCandidates();
  const idx = all.findIndex(c => c.id === candidate.id);
  if (idx >= 0) all[idx] = candidate;
  else all.unshift(candidate);
  write(FILES.ucCandidates, all.slice(0, 1000));
  return candidate;
}

export function updateUCCandidate(id, updates) {
  const all = getUCCandidates();
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  write(FILES.ucCandidates, all);
  return all[idx];
}

export function deleteUCCandidate(id) {
  const all = getUCCandidates().filter(c => c.id !== id);
  write(FILES.ucCandidates, all);
}

// ─── UC Sequences ─────────────────────────────────────────────────────────────

export function getUCSequences() {
  return read(FILES.ucSequences, []);
}

export function saveUCSequence(seq) {
  const all = getUCSequences();
  const idx = all.findIndex(s => s.candidateId === seq.candidateId);
  if (idx >= 0) all[idx] = seq;
  else all.unshift(seq);
  write(FILES.ucSequences, all.slice(0, 1000));
  return seq;
}

export function updateUCSequence(candidateId, updates) {
  const all = getUCSequences();
  const idx = all.findIndex(s => s.candidateId === candidateId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  write(FILES.ucSequences, all);
  return all[idx];
}

export function getUCSequenceByCandidateId(candidateId) {
  return getUCSequences().find(s => s.candidateId === candidateId) || null;
}
