// Upload files to GitHub via API
const fs = require('fs');
const crypto = require('crypto');

// Get token from git remote
const { execSync } = require('child_process');
const url = execSync('git -C C:/Users/menin/cardapio-v3 remote get-url origin', { encoding: 'utf8' }).trim();
const token = url.split('x-access-token:')[1].split('@')[0];

const BASE_URL = 'https://api.github.com/repos/netdiscada/Cardapio-Quatinga';
const HEADERS = {
  'Authorization': `token ${token}`,
  'Accept': 'application/vnd.github+json',
  'Content-Type': 'application/json'
};

async function githubApi(endpoint, method = 'GET', body = null) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${text}`);
  return JSON.parse(text);
}

async function uploadFile(localPath, githubPath) {
  const content = fs.readFileSync(localPath, 'utf8');
  const blob = await githubApi('/git/blobs', 'POST', {
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64'
  });
  console.log(`Blob for ${githubPath}: ${blob.sha}`);
  return { path: githubPath, mode: '100644', type: 'blob', sha: blob.sha };
}

async function main() {
  try {
    const files = [
      { local: 'C:/Users/menin/cardapio-v3/js/notificationChecker.js', github: 'js/notificationChecker.js' },
      { local: 'C:/Users/menin/cardapio-v3/js/notificationTrigger.js', github: 'js/notificationTrigger.js' },
      { local: 'C:/Users/menin/cardapio-v3/js/app.js', github: 'js/app.js' },
      { local: 'C:/Users/menin/cardapio-v3/js/order.js', github: 'js/order.js' },
      { local: 'C:/Users/menin/cardapio-v3/js/admin.js', github: 'js/admin.js' },
      { local: 'C:/Users/menin/cardapio-v3/index.html', github: 'index.html' }
    ];

    console.log('Creating blobs...');
    const treeItems = [];
    for (const f of files) {
      treeItems.push(await uploadFile(f.local, f.github));
    }

    console.log('Creating tree...');
    const tree = await githubApi('/git/trees', 'POST', {
      base_tree: '2fb544b1108027189f01c7b444ddd6a3264199c8',
      tree: treeItems
    });
    console.log(`Tree: ${tree.sha}`);

    console.log('Creating commit...');
    const commit = await githubApi('/git/commits', 'POST', {
      message: 'V3 with Vercel push notifications (full files)',
      tree: tree.sha,
      parents: ['2fb544b1108027189f01c7b444ddd6a3264199c8']
    });
    console.log(`Commit: ${commit.sha}`);

    console.log('Updating main ref...');
    await githubApi('/git/refs/heads/main', 'PATCH', {
      sha: commit.sha,
      force: true
    });
    console.log('✅ Done!');

  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();