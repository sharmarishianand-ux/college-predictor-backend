const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'data', 'cutoffs.json');

const colleges = [
  { name: 'IIT Bombay', type: 'IIT', state: 'Maharashtra', location: 'Mumbai' },
  { name: 'IIT Delhi', type: 'IIT', state: 'Delhi', location: 'New Delhi' },
  { name: 'IIT Kanpur', type: 'IIT', state: 'Uttar Pradesh', location: 'Kanpur' },
  { name: 'IIT Madras', type: 'IIT', state: 'Tamil Nadu', location: 'Chennai' },
  { name: 'NIT Trichy', type: 'NIT', state: 'Tamil Nadu', location: 'Tiruchirappalli' },
  { name: 'NIT Warangal', type: 'NIT', state: 'Telangana', location: 'Warangal' },
  { name: 'IIIT Hyderabad', type: 'IIIT', state: 'Telangana', location: 'Hyderabad' },
  { name: 'BITS Pilani', type: 'GFTI', state: 'Rajasthan', location: 'Pilani' },
  { name: 'Delhi Technological University', type: 'GFTI', state: 'Delhi', location: 'New Delhi' }
];

const branches = [
  { name: 'Computer Science and Engineering', baseRank: 100 },
  { name: 'Artificial Intelligence and Data Science', baseRank: 300 },
  { name: 'Electronics and Communication Engineering', baseRank: 500 },
  { name: 'Electrical Engineering', baseRank: 800 },
  { name: 'Mechanical Engineering', baseRank: 1500 },
  { name: 'Civil Engineering', baseRank: 3000 },
  { name: 'Chemical Engineering', baseRank: 3500 },
];

const categories = [
  { name: 'OPEN', mult: 1, type: 'General' },
  { name: 'EWS', mult: 1.5, type: 'EWS' },
  { name: 'OBC-NCL', mult: 2.5, type: 'OBC' },
  { name: 'SC', mult: 6.0, type: 'SC' },
  { name: 'ST', mult: 10.0, type: 'ST' }
];

const quotas = ['AI', 'HS', 'OS'];
const genders = ['Gender-Neutral', 'Female-only (including Supernumerary)'];
const years = [2023, 2024, 2025];

let data = [];

// Base logic for randomizing
function randRank(base, variance) {
  const delta = base * variance * (Math.random() * 2 - 1);
  return Math.max(1, Math.floor(base + delta));
}

// Generate combinations
for (const col of colleges) {
  // Offset multiplier per college (IITB harder, NIT easier)
  const colMult = col.type === 'IIT' ? 1 : col.type === 'NIT' ? 3 : col.type === 'IIIT' ? 2 : 4;

  for (const br of branches) {
    for (const cat of categories) {
      for (const q of quotas) {
        // Skip AI for some, etc. Keep it simple and generate for all to ensure rich data
        for (const gen of genders) {
          
          const genMult = gen.includes('Female') ? 1.5 : 1;
          
          let prevClosing = Math.floor(br.baseRank * colMult * cat.mult * genMult);
          
          for (const yr of years) {
            // Rank changes slightly each year
            const closing = randRank(prevClosing, 0.15); // +/- 15% variation year over year
            const opening = Math.max(1, Math.floor(closing * 0.7)); // opening is ~70% of closing
            prevClosing = closing; // for realistic trending

            data.push({
              _id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
              collegeName: col.name,
              branch: br.name,
              category: cat.type,
              seatType: cat.name,
              quota: q,
              gender: gen,
              closingRank: closing,
              openingRank: opening,
              year: yr,
              location: col.location,
              state: col.state,
              instituteType: col.type
            });
          }
        }
      }
    }
  }
}

fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
console.log(`Successfully generated ${data.length} records across 2023, 2024, and 2025.`);
