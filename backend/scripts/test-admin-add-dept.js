const axios = require('axios');

async function runTest() {
  try {
    // 1. Log in as admin
    const loginRes = await axios.post('http://localhost:5000/api/v1/admin/login', {
      username: 'admin@police.gov.in',
      password: 'AdminPassword123!'
    });
    
    console.log('Login Response keys:', Object.keys(loginRes.data));
    console.log('Login Response data:', loginRes.data.data);
    const token = loginRes.data.data?.token || loginRes.data.token || loginRes.data.data?.accessToken;
    
    console.log('Logged in successfully. Token:', token ? 'Received' : 'Not received');

    // 2. Add WazirX department
    const payload = {
      entity_id: 'wazirx_crypto',
      entity_name: 'WazirX',
      category: 'Crypto Exchange',
      contact_email_pattern: 'nodal@wazirx.test',
      what_they_can_provide: ['Wallet freezing', 'KYC details', 'Transaction history'],
      legal_basis_typically_cited: ['BNSS 94'],
      request_format_expected: 'PDF notice with wallet address',
      typical_response_time: '4 hours',
      escalation_path_if_no_response: 'nodal_escalation@wazirx.test',
      notes_or_caveats: 'Responsive exchange',
      confidence: 'high'
    };

    const addRes = await axios.post('http://localhost:5000/api/v1/admin/departments', payload, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Added department successfully:', addRes.data.data.entity_id);

    // 3. Test mock login for WazirX
    try {
      const wazirxLoginRes = await axios.post('http://localhost:5000/api/v1/department-portal/login', {
        username: 'wazirx_crypto',
        password: 'Testing123!'
      });
      console.log('Mock login successful for wazirx_crypto. Token received.');
    } catch (e) {
      console.error('Mock login failed for wazirx_crypto:', e.response?.data || e.message);
    }

  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

runTest();
