const fs = require('fs');
const readline = require('readline');

async function reconstruct() {
  const logPath = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\51068eaf-0177-49b4-a1ff-4801b0655763\\.system_generated\\logs\\transcript_full.jsonl';
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let linesMap = new Map();

  for await (const line of rl) {
    if (line.includes('personnel.css') && line.includes('Total Lines: 3225')) {
      const matchContent = line.match(/<line_number>: <original_line>.*?\\n(.*?)(\"|The above content does NOT show)/);
      if (matchContent) {
          const rawText = matchContent[1].replace(/\\n/g, '\n');
          const lines = rawText.split('\n');
          for (let l of lines) {
             const m = l.match(/^(\d+): (.*)$/);
             if (m) linesMap.set(parseInt(m[1], 10), m[2]);
             else {
                 const m2 = l.match(/^(\d+):$/);
                 if (m2) linesMap.set(parseInt(m2[1], 10), '');
             }
          }
      }
    }
  }

  const maxLine = Math.max(...Array.from(linesMap.keys()));
  console.log('Max line found:', maxLine);
  console.log('Total keys:', linesMap.size);
  if (maxLine === 3225 && linesMap.size === 3225) {
     let out = [];
     for(let i=1; i<=3225; i++) {
         out.push(linesMap.get(i) !== undefined ? linesMap.get(i) : '');
     }
     fs.writeFileSync('c:\\Users\\ASUS\\Clinique-RH-4.10.2\\frontend\\src\\personnel\\personnel.css', out.join('\n'));
     console.log('File successfully restored!');
  } else {
     let missing = [];
     for(let i=1; i<=3225; i++) if (!linesMap.has(i)) missing.push(i);
     console.log('Missing lines:', missing.length > 0 ? missing.join(',') : 'None');
  }
}

reconstruct();
