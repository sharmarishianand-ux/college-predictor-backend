const pdfmake = require('pdfmake');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../uploads/pdfs');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Define custom fonts with standard Helvetica
const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

pdfmake.setFonts(fonts);

/**
 * Generate a PDF for the predictions matching the Spreadsheet Template
 * @param {Object} studentDetails 
 * @param {Object} categories { dreamColleges, realisticColleges, safeColleges }
 * @returns {Promise<Object>} { pdfPath, filename }
 */
async function generatePredictionPDF(studentDetails, categories) {
  return new Promise((resolve, reject) => {
    try {
      const { dreamColleges, realisticColleges, safeColleges } = categories;

      const safeName = (studentDetails.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Prediction_Report_${safeName}_${Date.now()}.pdf`;
      const pdfPath = path.join(UPLOADS_DIR, filename);

      const tableLayout = {
        hLineWidth: function (i, node) { return 0.5; },
        vLineWidth: function (i, node) { return 0.5; },
        hLineColor: function (i, node) { return '#e2e8f0'; },
        vLineColor: function (i, node) { return '#e2e8f0'; },
        paddingLeft: function(i, node) { return 8; },
        paddingRight: function(i, node) { return 8; },
        paddingTop: function(i, node) { return 8; },
        paddingBottom: function(i, node) { return 8; }
      };

      const buildTable = (colleges, title, tintColor, headerBgColor, borderColor) => {
        const tableLayout = {
          hLineWidth: function (i, node) { return 0.5; },
          vLineWidth: function (i, node) { return 0.5; },
          hLineColor: function (i, node) { return borderColor || '#e2e8f0'; },
          vLineColor: function (i, node) { return borderColor || '#e2e8f0'; },
          paddingLeft: function(i, node) { return 8; },
          paddingRight: function(i, node) { return 8; },
          paddingTop: function(i, node) { return 8; },
          paddingBottom: function(i, node) { return 8; }
        };

        const body = [];
        // The section title row
        body.push([
          { 
            text: title, 
            colSpan: 13, 
            style: 'sectionTitle',
            color: headerBgColor, 
            fillColor: tintColor,
            alignment: 'left',
            margin: [5, 5, 5, 5]
          },
          '','','','','','','','','','','',''
        ]);

        // Headers
        body.push([
          { text: 'SR.No.', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Institute', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'State', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Program', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Quota', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Seat Type', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Gender', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Closing Rank (2025)', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Institute Type', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Closing Rank (2024)', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Closing Rank (2023)', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Average Rank', style: 'tableHeader', fillColor: headerBgColor },
          { text: 'Trend', style: 'tableHeader', fillColor: headerBgColor }
        ]);

        if (!colleges || colleges.length === 0) {
          body.push([
            { text: 'No colleges found in this category.', colSpan: 13, alignment: 'center', style: 'tableCell' },
            '','','','','','','','','','','',''
          ]);
        } else {
          colleges.forEach((c, idx) => {
            const fillColor = idx % 2 === 0 ? tintColor : '#ffffff';
            const displayRank2024 = c.closingRank2024 ? c.closingRank2024.toString() : '-';
            const displayRank2023 = c.closingRank2023 ? c.closingRank2023.toString() : '-';
            const displayAverage = c.averageRank ? c.averageRank.toString() : '-';
            const displayTrend = c.trend || 'Stable';

            body.push([
              { text: (idx + 1).toString(), style: 'tableCell', fillColor },
              { text: c.collegeName || '-', style: 'tableCell', fillColor, alignment: 'left' },
              { text: c.state || '-', style: 'tableCell', fillColor },
              { text: c.branch || '-', style: 'tableCell', fillColor, alignment: 'left' },
              { text: c.quota || '-', style: 'tableCell', fillColor },
              { text: c.seatType || '-', style: 'tableCell', fillColor },
              { text: c.gender || '-', style: 'tableCell', fillColor },
              { text: c.closingRank ? c.closingRank.toString() : 'NA', style: 'tableCell', fillColor },
              { text: c.instituteType || '-', style: 'tableCell', fillColor },
              { text: displayRank2024, style: 'tableCell', fillColor }, // 2024
              { text: displayRank2023, style: 'tableCell', fillColor }, // 2023
              { text: displayAverage, style: 'tableCell', fillColor }, // Average
              { text: displayTrend, style: 'tableCell', fillColor }  // Trend
            ]);
          });
        }

        return {
          table: {
            headerRows: 2,
            widths: ['auto', '*', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: body
          },
          layout: tableLayout,
          margin: [0, 0, 0, 20]
        };
      };

      const docDefinition = {
        pageOrientation: 'landscape',
        pageSize: 'A3',
        defaultStyle: { font: 'Helvetica', fontSize: 11, lineHeight: 1.5 },
        pageMargins: [40, 40, 40, 60],
        footer: function(currentPage, pageCount) {
          return {
            text: `Generated by Counselling Is Easy 4U | Email: counsellingiseasy4u@gmail.com | Page ${currentPage} of ${pageCount}`,
            alignment: 'center',
            fontSize: 9,
            color: '#64748b',
            margin: [0, 10, 0, 0]
          };
        },
        content: [
          // Student Profile Info Grid
          {
            table: {
              widths: ['20%', '30%', '20%', '30%'],
              body: [
                [
                  { text: 'CRL Rank (Number)', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: studentDetails.crlRank ? studentDetails.crlRank.toString() : '-', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ],
                [
                  { text: 'Quota', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: studentDetails.quota || 'AI', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ],
                [
                  { text: 'Seat Type', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: studentDetails.category || '-', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ],
                [
                  { text: 'Gender', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: studentDetails.gender || '-', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ],
                [
                  { text: '12th State', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: studentDetails.state || '-', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ],
                [
                  { text: 'Academic Program Name', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: 'ALL', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ],
                [
                  { text: 'Institute Type', bold: true, color: '#1d4ed8', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: 'ALL', fontSize: 11, margin: [4, 4, 4, 4] },
                  { text: '', border: [false, false, false, false] },
                  { text: '', border: [false, false, false, false] }
                ]
              ]
            },
            layout: {
              hLineWidth: function (i, node) { return 0.5; },
              vLineWidth: function (i, node) { return 0.5; },
              hLineColor: function (i, node) { return '#e2e8f0'; },
              vLineColor: function (i, node) { return '#e2e8f0'; },
              paddingLeft: function(i, node) { return 8; },
              paddingRight: function(i, node) { return 8; },
              paddingTop: function(i, node) { return 8; },
              paddingBottom: function(i, node) { return 8; }
            },
            margin: [0, 0, 0, 20]
          },
          
          // DREAM COLLEGES
          buildTable(dreamColleges, `DREAM COLLEGES (${dreamColleges.length})`, '#fef2f2', '#ef4444', '#fca5a5'),
          
          // REALISTIC COLLEGES
          buildTable(realisticColleges, `REALISTIC COLLEGES (${realisticColleges.length})`, '#eff6ff', '#3b82f6', '#93c5fd'),
          
          // SAFE COLLEGES
          buildTable(safeColleges, `SAFE COLLEGES (${safeColleges.length})`, '#f0fdf4', '#22c55e', '#86efac'),

          // HOW TO USE THIS REPORT
          {
            text: 'HOW TO USE THIS REPORT?',
            style: 'heading',
            color: '#dc2626'
          },
          {
            text: 'This report has been prepared using historical JoSAA counselling data (2023, 2024 and 2025) along with the information provided by the student. The purpose of this report is to help students and parents make informed and strategic choice-filling decisions.',
            style: 'normalText',
            margin: [0, 0, 0, 20]
          },
          
          // Explanations Box
          {
            table: {
              widths: ['*'],
              body: [
                [
                  { text: 'DREAM COLLEGES', style: 'sectionTitle', color: '#ef4444', fillColor: '#fef2f2', border: [false, false, false, false], margin: [10, 10, 10, 10] }
                ],
                [
                  {
                    stack: [
                      { text: 'Dream Colleges are institutes and branches where admission may be difficult but still possible based on your rank profile. These choices represent your aspirational targets.\n\nAdvice:', margin: [0, 0, 0, 10] },
                      {
                        ul: [
                          'Include Dream Colleges at the top of your choice list.',
                          'Do not depend only on Dream Colleges.',
                          'These options provide opportunities for better institutes and branches.'
                        ],
                        style: 'bulletList'
                      }
                    ],
                    border: [false, false, false, true],
                    margin: [10, 10, 10, 20]
                  }
                ],
                [
                  { text: 'REALISTIC COLLEGES', style: 'sectionTitle', color: '#3b82f6', fillColor: '#eff6ff', border: [false, false, false, false], margin: [10, 10, 10, 10] }
                ],
                [
                  {
                    stack: [
                      { text: 'Real Colleges are institutes and branches where your admission chances are considered reasonably good based on recent counselling trends and closing ranks.\n\nAdvice:', margin: [0, 0, 0, 10] },
                      {
                        ul: [
                          'Real Colleges should form the core of your choice list.',
                          'Most successful allotments generally come from this category.',
                          'Prioritize these options according to your interest and career goals.'
                        ],
                        style: 'bulletList'
                      }
                    ],
                    border: [false, false, false, true],
                    margin: [10, 10, 10, 20]
                  }
                ],
                [
                  { text: 'SAFE COLLEGES', style: 'sectionTitle', color: '#22c55e', fillColor: '#f0fdf4', border: [false, false, false, false], margin: [10, 10, 10, 10] }
                ],
                [
                  {
                    stack: [
                      { text: 'Safe Colleges are institutes and branches where admission probability is relatively higher based on historical data.\n\nAdvice:', margin: [0, 0, 0, 10] },
                      {
                        ul: [
                          'Always keep sufficient Safe Colleges in your choice list.',
                          'Safe Colleges work as a backup option.',
                          'A balanced choice list should contain Dream, Real and Safe options together.'
                        ],
                        style: 'bulletList'
                      }
                    ],
                    border: [false, false, false, true],
                    margin: [10, 10, 10, 20]
                  }
                ],
                [
                  { text: 'TREND GUIDE', style: 'sectionTitle', color: '#1d4ed8', fillColor: '#eff6ff', border: [false, false, false, false], margin: [10, 10, 10, 10] }
                ],
                [
                  {
                    stack: [
                      { text: '↑ Easier\nAdmission trend is becoming easier compared to previous years.', margin: [0, 0, 0, 10] },
                      { text: '↓ Harder\nCompetition is increasing and admission is becoming more challenging.', margin: [0, 0, 0, 10] },
                      { text: '→ Stable\nClosing ranks have remained relatively stable over recent years.' }
                    ],
                    border: [false, false, false, true],
                    margin: [10, 10, 10, 20]
                  }
                ],
                [
                  { text: 'IMPORTANT NOTE', style: 'sectionTitle', color: '#1d4ed8', fillColor: '#eff6ff', border: [false, false, false, false], margin: [10, 10, 10, 10] }
                ],
                [
                  {
                    ul: [
                      'Choose branches according to your interests, aptitude and long-term career goals.',
                      'Do not make decisions solely on institute reputation.',
                      'Consider both institute quality and branch preference.',
                      'Maintain a healthy balance between Dream, Real and Safe choices.',
                      'Before final submission, carefully review your complete choice list.'
                    ],
                    style: 'bulletList',
                    border: [false, false, false, true],
                    margin: [10, 10, 10, 20]
                  }
                ],
                [
                  { text: 'DISCLAIMER', style: 'sectionTitle', color: '#dc2626', fillColor: '#fef2f2', border: [false, false, false, false], margin: [10, 10, 10, 10] }
                ],
                [
                  {
                    text: 'This report is generated using historical JoSAA counselling data and the information provided by the student. The recommendations are intended only for guidance and decision-support purposes. Actual seat allotment depends on counselling competition, seat availability, reservation policies, choice-filling order and official JoSAA rules.\n\nThis report does not guarantee admission to any institute or branch.',
                    style: 'normalText',
                    border: [false, false, false, false],
                    margin: [10, 10, 10, 20]
                  }
                ]
              ]
            },
            layout: {
              hLineColor: function (i, node) { return '#e2e8f0'; },
              vLineColor: function (i, node) { return '#e2e8f0'; },
              paddingLeft: function(i, node) { return 8; },
              paddingRight: function(i, node) { return 8; },
              paddingTop: function(i, node) { return 8; },
              paddingBottom: function(i, node) { return 8; }
            }
          }
        ],
        styles: {
          heading: { fontSize: 18, bold: true, margin: [0, 10, 0, 10] },
          sectionTitle: { fontSize: 14, bold: true, margin: [0, 5, 0, 5] },
          normalText: { fontSize: 11, lineHeight: 1.5 },
          tableHeader: { bold: true, fontSize: 10, color: 'white', alignment: 'center', margin: [4, 4, 4, 4] },
          tableCell: { fontSize: 10, color: '#1e293b', alignment: 'center', margin: [4, 4, 4, 4], lineHeight: 1.5 },
          bulletList: { margin: [20, 5, 0, 10], fontSize: 11, lineHeight: 1.5 }
        }
      };

      const pdfDoc = pdfmake.createPdf(docDefinition);
      
      pdfDoc.write(pdfPath).then(() => {
        resolve({ pdfPath, filename });
      }).catch(err => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePredictionPDF
};
