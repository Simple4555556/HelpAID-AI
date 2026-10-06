import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  getHospitals,
  getDoctors,
  getBloodBanks,
  getMedicalStores,
  getPoliceStations
} from '../../../db.js';

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to generate embedding using text-embedding-004
async function generateSemanticEmbedding(text: string): Promise<number[]> {
  if (!apiKey || !text || text.trim() === '') return [];
  try {
    const response: any = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text
    });
    if (response) {
      if (response.embedding && response.embedding.values) {
        return response.embedding.values;
      }
      if (response.embeddings && response.embeddings.values) {
        return response.embeddings.values;
      }
    }
  } catch (error: any) {
    console.warn('[Search Embeddings Warning] Failed to generate query embedding:', error.message);
  }
  return [];
}

// Cosine similarity computation
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0.0 || normB === 0.0) return 0.0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Synonym dictionary mapping common terms to medical terms
function expandQuery(query: string): string[] {
  const synonyms: { [key: string]: string[] } = {
    'heart': ['cardiologist', 'cardiology', 'cardio', 'heart care'],
    'cardiologist': ['heart', 'cardiology'],
    'bone': ['orthopedic', 'orthopaedic', 'joint', 'fracture', 'bone & joint'],
    'orthopedic': ['bone', 'joint', 'fracture'],
    'orthopaedic': ['bone', 'joint', 'fracture'],
    'kid': ['pediatrician', 'pediatric', 'child'],
    'child': ['pediatrician', 'pediatric', 'child care'],
    'pediatrician': ['child', 'kid', 'pediatrics'],
    'eye': ['ophthalmologist', 'optometrist', 'vision', 'ent', 'eye care'],
    'skin': ['dermatologist', 'dermatology', 'skin care'],
    'dermatologist': ['skin'],
    'brain': ['neurologist', 'neurology', 'neuro'],
    'neurologist': ['brain'],
    'ent': ['ear', 'nose', 'throat', 'eye', 'ent specialist'],
    'ear': ['ent'],
    'nose': ['ent'],
    'throat': ['ent'],
    'pharmacy': ['medical', 'medicine', 'store', 'chemist', 'medical market'],
    'chemist': ['pharmacy', 'medical', 'medicine', 'store'],
    'medical store': ['pharmacy', 'chemist', 'medicine', 'medical market'],
    'blood': ['plasma', 'platelets', 'blood bank', 'blood center'],
    'er': ['emergency', 'trauma', 'icu'],
    'emergency': ['er', 'trauma', 'icu', 'first aid'],
    'trauma': ['emergency', 'er', 'icu', 'trauma care']
  };

  const cleanQuery = query.toLowerCase();
  const expanded = new Set<string>([cleanQuery]);

  // Exact phrases check
  if (cleanQuery.includes('heart doctor') || cleanQuery.includes('heart specialist')) {
    expanded.add('cardiologist');
    expanded.add('cardiology');
  }
  if (cleanQuery.includes('bone doctor') || cleanQuery.includes('bone specialist')) {
    expanded.add('orthopedic');
    expanded.add('orthopaedic');
  }
  if (cleanQuery.includes('eye doctor')) {
    expanded.add('eye');
    expanded.add('ent');
    expanded.add('ophthalmologist');
  }
  if (cleanQuery.includes('kid doctor') || cleanQuery.includes('child doctor')) {
    expanded.add('pediatrician');
    expanded.add('pediatric');
  }
  if (cleanQuery.includes('skin doctor')) {
    expanded.add('dermatologist');
    expanded.add('dermatology');
  }
  if (cleanQuery.includes('brain doctor')) {
    expanded.add('neurologist');
  }
  if (cleanQuery.includes('ear doctor') || cleanQuery.includes('nose doctor') || cleanQuery.includes('throat doctor')) {
    expanded.add('ent');
    expanded.add('ent specialist');
  }

  // Substring checks
  for (const key of Object.keys(synonyms)) {
    if (cleanQuery.includes(key)) {
      synonyms[key].forEach(syn => expanded.add(syn));
    }
  }

  return Array.from(expanded);
}

export async function fuzzySearch(req: Request, res: Response) {
  const query = req.query.q as string;
  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Search query parameter (q) is required.' });
  }

  try {
    // 1. Synonym query expansion
    const expandedTerms = expandQuery(query);
    const searchRegexList = expandedTerms.map(term => new RegExp(term, 'i'));
    
    // Fallback combined regex matching any expanded term
    const searchRegex = new RegExp(expandedTerms.join('|'), 'i');

    // 2. Perform parallel searches across collections using DB wrappers
    const [hospitals, doctors, bloodBanks, medicalStores, policeStations] = await Promise.all([
      getHospitals({
        $or: [
          { name: searchRegex },
          { address: searchRegex },
          { city: searchRegex },
          { district: searchRegex },
          { specializations: searchRegex }
        ]
      }),
      getDoctors({
        $or: [
          { name: searchRegex },
          { specialization: searchRegex },
          { clinic: searchRegex },
          { hospital: searchRegex }
        ]
      }),
      getBloodBanks({
        $or: [
          { name: searchRegex },
          { address: searchRegex },
          { city: searchRegex },
          { bloodGroup: searchRegex },
          { availableBloodGroups: searchRegex }
        ]
      }),
      getMedicalStores({
        $or: [
          { name: searchRegex },
          { address: searchRegex },
          { city: searchRegex }
        ]
      }),
      getPoliceStations({
        $or: [
          { name: searchRegex },
          { address: searchRegex },
          { city: searchRegex }
        ]
      })
    ]);

    // Format output (limit each to top 5 results for clean list view)
    let formattedHospitals = hospitals.map((item: any) => ({
      type: 'Hospital',
      id: item._id,
      name: item.name,
      details: `${item.type || 'General'} - ${item.city || ''}, ${item.state || ''}`,
      phone: item.phone,
      embedding: item.embedding || []
    }));

    let formattedDoctors = doctors.map((item: any) => ({
      type: 'Doctor',
      id: item._id,
      name: item.name,
      details: `${item.specialization} at ${item.clinic || item.hospital || 'Private Clinic'}`,
      phone: item.phone,
      embedding: item.embedding || []
    }));

    let formattedBloodBanks = bloodBanks.map((item: any) => ({
      type: 'Blood Bank',
      id: item._id,
      name: item.name,
      details: `Groups: ${(item.availableBloodGroups && item.availableBloodGroups.length) ? item.availableBloodGroups.join(', ') : item.bloodGroup || 'All'} - ${item.city || ''}`,
      phone: item.phone,
      embedding: item.embedding || []
    }));

    let formattedMedicalStores = medicalStores.map((item: any) => ({
      type: 'Medical Store',
      id: item._id,
      name: item.name,
      details: `${item.address || item.city || ''}`,
      phone: item.phone,
      embedding: item.embedding || []
    }));

    let formattedPoliceStations = policeStations.map((item: any) => ({
      type: 'Police Station',
      id: item._id,
      name: item.name,
      details: `${item.address || item.city || ''}`,
      phone: item.phone,
      embedding: item.embedding || []
    }));

    let allResults: any[] = [
      ...formattedHospitals,
      ...formattedDoctors,
      ...formattedBloodBanks,
      ...formattedMedicalStores,
      ...formattedPoliceStations
    ];

    // 3. Optional Semantic Search ranking if Gemini is online
    const queryEmbedding = await generateSemanticEmbedding(query);
    if (queryEmbedding.length > 0) {
      console.log(`[Search Service] Performing semantic similarity ranking for: "${query}"`);
      allResults = allResults.map(item => {
        const similarity = item.embedding && item.embedding.length > 0 
          ? cosineSimilarity(queryEmbedding, item.embedding) 
          : 0;
        return { ...item, semanticScore: similarity };
      });
      // Sort by semantic score descending, falling back to exact keyword match matches
      allResults.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
    }

    // Clean up response objects to hide embeddings raw vectors
    const cleanResults = allResults.map(({ embedding, ...rest }) => rest).slice(0, 15);

    return res.json({
      success: true,
      query: query,
      count: cleanResults.length,
      results: cleanResults
    });

  } catch (error: any) {
    console.error(`[Search Controller Error] Global fuzzy search failed:`, error.message);
    return res.status(500).json({ error: 'Failed to execute fuzzy search query.' });
  }
}
