import { getHospitals } from '../db.js';

async function run() {
  try {
    const list = await getHospitals({});
    console.log('Hospitals:', list.length);
  } catch (err) {
    console.error('Error occurred:', err);
  }
}

run();
