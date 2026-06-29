const XLSX = require('xlsx');
const fs = require('fs');

const data = [
  { "College Name": "IIT Bombay", "Branch": "Computer Science and Engineering", "Category": "General", "Closing Rank": 61, "Location": "Mumbai", "State": "Maharashtra" },
  { "College Name": "IIT Bombay", "Branch": "Computer Science and Engineering", "Category": "OBC", "Closing Rank": 250, "Location": "Mumbai", "State": "Maharashtra" },
  { "College Name": "IIT Bombay", "Branch": "Electrical Engineering", "Category": "General", "Closing Rank": 380, "Location": "Mumbai", "State": "Maharashtra" },
  { "College Name": "IIT Delhi", "Branch": "Computer Science and Engineering", "Category": "General", "Closing Rank": 105, "Location": "New Delhi", "State": "Delhi" },
  { "College Name": "IIT Delhi", "Branch": "Computer Science and Engineering", "Category": "SC", "Closing Rank": 650, "Location": "New Delhi", "State": "Delhi" },
  { "College Name": "NIT Trichy", "Branch": "Computer Science and Engineering", "Category": "General", "Closing Rank": 714, "Location": "Tiruchirappalli", "State": "Tamil Nadu" },
  { "College Name": "NIT Trichy", "Branch": "Mechanical Engineering", "Category": "General", "Closing Rank": 6540, "Location": "Tiruchirappalli", "State": "Tamil Nadu" },
  { "College Name": "NIT Trichy", "Branch": "Mechanical Engineering", "Category": "OBC", "Closing Rank": 2100, "Location": "Tiruchirappalli", "State": "Tamil Nadu" },
  { "College Name": "NIT Warangal", "Branch": "Electronics and Communication", "Category": "General", "Closing Rank": 3150, "Location": "Warangal", "State": "Telangana" },
  { "College Name": "NIT Warangal", "Branch": "Civil Engineering", "Category": "ST", "Closing Rank": 1200, "Location": "Warangal", "State": "Telangana" },
  { "College Name": "BITS Pilani", "Branch": "Computer Science", "Category": "General", "Closing Rank": 350, "Location": "Pilani", "State": "Rajasthan" },
  { "College Name": "IIIT Hyderabad", "Branch": "Computer Science and Engineering", "Category": "General", "Closing Rank": 250, "Location": "Hyderabad", "State": "Telangana" },
  { "College Name": "IIIT Hyderabad", "Branch": "Electronics and Communication", "Category": "EWS", "Closing Rank": 900, "Location": "Hyderabad", "State": "Telangana" },
  { "College Name": "Delhi Technological University", "Branch": "Software Engineering", "Category": "General", "Closing Rank": 4500, "Location": "New Delhi", "State": "Delhi" },
  { "College Name": "Delhi Technological University", "Branch": "Software Engineering", "Category": "OBC", "Closing Rank": 12000, "Location": "New Delhi", "State": "Delhi" }
];

const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Cutoffs");

const filePath = '/Users/rishianandsharma/Desktop/demo_colleges.xlsx';
XLSX.writeFile(workbook, filePath);
console.log("Excel file successfully created at:", filePath);
