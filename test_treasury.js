
async function test() {
    try {
        const response = await fetch('http://localhost:3002/api/treasury/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                opIds: ["A0000700017348"],
                accountId: 1019 // Numeric Account ID (Cheques/Banco from SBA01)
            })
        });
        const json = await response.json();
        console.log("Status:", response.status);
        console.log("Response:", JSON.stringify(json, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
