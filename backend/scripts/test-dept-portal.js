const axios = require('axios');

async function test() {
  const login = async (username) => {
    const res = await axios.post('http://localhost:5000/api/v1/department-portal/login', {
      username,
      password: 'Testing123!'
    });
    return res.data.data;
  };

  const getInbox = async (entityId) => {
    const res = await axios.get(`http://localhost:5000/api/v1/department-portal/inbox?department_entity_id=${entityId}`);
    return res.data.data;
  };

  try {
    const hdfc = await login('hdfc_bank');
    console.log('Logged in HDFC:', hdfc);
    const hdfcInbox = await getInbox(hdfc.department_entity_id);
    console.log(`HDFC Inbox has ${hdfcInbox.length} requests`);
    
    const jio = await login('jio');
    console.log('Logged in Jio:', jio);
    const jioInbox = await getInbox(jio.department_entity_id);
    console.log(`Jio Inbox has ${jioInbox.length} requests`);

  } catch(e) {
    console.error('Error:', e.response?.data || e.message);
  }
}

test();
