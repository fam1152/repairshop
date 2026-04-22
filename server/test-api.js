const jwt = require('jsonwebtoken');
const axios = require('axios');

const secret = '4ad119b0c98a3258b4b0b46055672c51d5124df7039e232a20bb4213e54f0eac';
const userId = 'ed1c7949-8624-4952-a8f5-4d2c1ee45776';
const token = jwt.sign({ id: userId, username: 'admin', role: 'admin' }, secret);

axios.get('http://localhost:3000/api/settings', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => {
  console.log('Settings:', r.data);
}).catch(e => {
  console.error('Error:', e.response ? e.response.status : e.message);
});
