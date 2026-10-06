export class GoogleMapsService {
  /**
   * For the backend, we might want to calculate directions or distance matrix.
   * However, most interactive routing is done via the Maps JS API on the frontend.
   * This service can provide server-side distance matrices if needed for ranking.
   */
  static async getDistanceMatrix(originLat: number, originLng: number, destinations: {lat: number, lng: number}[]) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!apiKey || destinations.length === 0) return null;

    const origins = `${originLat},${originLng}`;
    const dests = destinations.map(d => `${d.lat},${d.lng}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${dests}&key=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Distance Matrix API failed');
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[GoogleMapsService]', err);
      return null;
    }
  }
}
