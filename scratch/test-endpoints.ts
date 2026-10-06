import fetch from 'node-fetch'; // wait, node-fetch may not be installed or enabled, let's use dynamic import or use standard fetch since Node 18+ has native fetch!
// Yes, Node 18+ has global fetch, so we can just use the global fetch API directly!

const BASE_URL = 'http://localhost:5000/api';

async function testWorkflow() {
  console.log('--- STARTING PROGRAMMATIC ENDPOINT AUDIT ---');

  try {
    // 1. Register a new Patient
    console.log('\n[1] Registering a new patient...');
    const registerRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_patient_audit@helpaid.com',
        password: 'password123',
        name: 'John Audit',
        phone: '9000000099',
        bloodGroup: 'O+',
        emergencyContact: '9000000000',
        role: 'user'
      })
    });
    const registerData: any = await registerRes.json();
    console.log('Register status:', registerRes.status, registerData);

    // 2. Login as Patient
    console.log('\n[2] Logging in as patient...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_patient_audit@helpaid.com',
        password: 'password123'
      })
    });
    const loginData: any = await loginRes.json();
    console.log('Login status:', loginRes.status, 'success:', loginData.success);
    if (!loginData.success) throw new Error('Patient Login failed');
    const patientToken = loginData.token;
    const patientUserId = loginData.user.id;

    // 3. Create SOS Case
    console.log('\n[3] Creating SOS Emergency Case...');
    const sosRes = await fetch(`${BASE_URL}/sos/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({
        userId: patientUserId,
        patientName: 'John Audit',
        patient_phone: '9000000099',
        injuryType: 'Fracture',
        severity: 'CRITICAL',
        emergencyDescription: 'Audit test case',
        lat: 26.5500,
        lng: 80.4900,
        patient_location_address: 'Unnao Central Market'
      })
    });
    const sosData: any = await sosRes.json();
    console.log('SOS create status:', sosRes.status, sosData);
    if (!sosData.success) throw new Error('SOS creation failed');
    const caseId = sosData.caseId;

    // 4. Login as Doctor
    console.log('\n[4] Logging in as Doctor Ashok Kumar...');
    const docLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'drashokkumar_0@helpaid.com',
        password: 'password123'
      })
    });
    const docLoginData: any = await docLoginRes.json();
    console.log('Doctor Login status:', docLoginRes.status, 'success:', docLoginData.success);
    if (!docLoginData.success) throw new Error('Doctor Login failed');
    const doctorToken = docLoginData.token;

    // 5. Doctor accepts SOS Case
    console.log('\n[5] Doctor accepting SOS Case...');
    const acceptRes = await fetch(`${BASE_URL}/sos/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}`
      },
      body: JSON.stringify({ caseId })
    });
    const acceptData: any = await acceptRes.json();
    console.log('Doctor Accept status:', acceptRes.status, acceptData);
    if (!acceptData.success) throw new Error('Doctor Accept failed');

    // 6. Get Patient Status (Should show DOCTOR_ACCEPTED)
    console.log('\n[6] Getting Patient status details (Doctor Accepted)...');
    const statusRes = await fetch(`${BASE_URL}/sos/patient-status/${caseId}`);
    const statusData: any = await statusRes.json();
    console.log('Patient status response:', statusRes.status, {
      status: statusData.status,
      assignedDoctor: statusData.acceptedDetails?.doctorName,
      assignedAmbulance: statusData.assignedAmbulance?.name,
      assignedHospital: statusData.assignedHospital?.name
    });

    // 7. Login as Ambulance Driver
    console.log('\n[7] Logging in as Ambulance Driver...');
    const driverLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '108ambulanceser_0@helpaid.com',
        password: 'password123'
      })
    });
    const driverLoginData: any = await driverLoginRes.json();
    console.log('Driver Login status:', driverLoginRes.status, 'success:', driverLoginData.success);
    if (!driverLoginData.success) throw new Error('Driver Login failed');
    const driverToken = driverLoginData.token;
    const driverAmbulanceProfileId = driverLoginData.user.ambulanceProfileId;

    // 8. Fetch active/pending dispatches on mount (Deliver pending requests immediately after login)
    console.log('\n[8] Fetching active cases for Ambulance Driver on mount...');
    const activeRes = await fetch(`${BASE_URL}/sos/active`, {
      headers: { 'Authorization': `Bearer ${driverToken}` }
    });
    const activeData: any = await activeRes.json();
    console.log('Active cases count:', activeData.cases?.length);
    const pendingRequest = activeData.cases?.find((c: any) => c.notifiedAmbulanceIds?.includes(driverAmbulanceProfileId));
    console.log('Found pending dispatch for this driver:', pendingRequest ? 'YES' : 'NO', 'Case ID:', pendingRequest?._id);
    if (!pendingRequest) throw new Error('Pending request was not delivered to the driver after login');

    // 9. Ambulance Driver accepts the case
    console.log('\n[9] Ambulance Driver accepting Case...');
    const ambAcceptRes = await fetch(`${BASE_URL}/sos/accept-ambulance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${driverToken}`
      },
      body: JSON.stringify({ caseId })
    });
    const ambAcceptData: any = await ambAcceptRes.json();
    console.log('Ambulance Accept status:', ambAcceptRes.status, ambAcceptData);
    if (!ambAcceptData.success) throw new Error('Ambulance Accept failed');

    // 10. Get Patient Status again (Should show AMBULANCE_ASSIGNED)
    console.log('\n[10] Getting Patient status details (Ambulance Assigned)...');
    const finalStatusRes = await fetch(`${BASE_URL}/sos/patient-status/${caseId}`);
    const finalStatusData: any = await finalStatusRes.json();
    console.log('Final Patient status response:', finalStatusRes.status, {
      status: finalStatusData.status,
      assignedDoctor: finalStatusData.acceptedDetails?.doctorName,
      assignedAmbulance: finalStatusData.assignedAmbulance?.name,
      assignedHospital: finalStatusData.assignedHospital?.name
    });

    console.log('\n--- AUDIT COMPLETE: ALL CRITICAL ENDPOINTS AND OFFLINE DELIVERY WORKFLOW WORKING CORRECTLY ---');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ AUDIT FAILED:', error.message);
    process.exit(1);
  }
}

testWorkflow();
