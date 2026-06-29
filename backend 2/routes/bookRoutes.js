const express = require('express');
const router = express.Router();
const { verifyToken } = require('../controllers/adminController');
const {
  getAllBooks,
  createBook,
  bulkCreateBooks,
  updateBook,
  deleteBook,
  resetBook
} = require('../controllers/bookController');

// All book routes require admin authentication
router.use(verifyToken);

router.get('/', getAllBooks);
router.post('/', createBook);
router.post('/bulk', bulkCreateBooks);
router.put('/:id', updateBook);
router.delete('/:id', deleteBook);
router.post('/:id/reset', resetBook);

module.exports = router;
