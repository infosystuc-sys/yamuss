
import http from 'http';

// ID with leading space as seen in logs and screenshot URL
const id = ' 0000000012450';
// Encode for URL
const encodedId = encodeURIComponent(id);
const url = `http://localhost:3002/api/orders/${encodedId}`;

console.log(`Fetching ${url}...`);

http.get(url, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("Body:", data);
    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
