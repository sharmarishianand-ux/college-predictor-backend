const { Books } = require('../config/db');

// Get all books
async function getAllBooks(req, res) {
  try {
    const books = await Books.find({});
    return res.json({ books });
  } catch (error) {
    console.error('Error fetching books:', error);
    return res.status(500).json({ message: 'Error fetching books' });
  }
}

// Create a single Book ID
async function createBook(req, res) {
  const { bookId, predictionLimit } = req.body;
  if (!bookId) {
    return res.status(400).json({ message: 'Book ID is required' });
  }

  try {
    const existing = await Books.findOne({ bookId });
    if (existing) {
      return res.status(409).json({ message: 'Book ID already exists' });
    }

    const limit = predictionLimit || 20;
    const newBook = await Books.create({
      bookId,
      status: 'Unused',
      predictionLimit: limit,
      remainingPredictions: limit,
      predictionsUsed: 0
    });

    return res.status(201).json({ message: 'Book ID created successfully', book: newBook });
  } catch (error) {
    console.error('Error creating book:', error);
    return res.status(500).json({ message: 'Error creating book ID' });
  }
}

// Bulk generate Book IDs
async function bulkCreateBooks(req, res) {
  const { prefix, count, predictionLimit } = req.body;
  if (!prefix || !count) {
    return res.status(400).json({ message: 'Prefix and count are required' });
  }

  try {
    const num = parseInt(count);
    const limit = parseInt(predictionLimit) || 20;
    const newBooks = [];

    // Find highest existing number for this prefix
    const allBooks = await Books.find({});
    let maxNum = 0;
    
    allBooks.forEach(b => {
      if (b.bookId.startsWith(prefix)) {
        const numPart = b.bookId.substring(prefix.length);
        if (!isNaN(numPart)) {
          maxNum = Math.max(maxNum, parseInt(numPart));
        }
      }
    });

    for (let i = 1; i <= num; i++) {
      const newNum = maxNum + i;
      const formattedNum = newNum.toString().padStart(3, '0');
      newBooks.push({
        bookId: `${prefix}${formattedNum}`,
        status: 'Unused',
        predictionLimit: limit,
        remainingPredictions: limit,
        predictionsUsed: 0
      });
    }

    await Books.insertMany(newBooks);

    return res.status(201).json({ 
      message: `Successfully generated ${num} Book IDs`,
      count: num
    });
  } catch (error) {
    console.error('Error bulk creating books:', error);
    return res.status(500).json({ message: 'Error bulk generating Book IDs' });
  }
}

// Update a book
async function updateBook(req, res) {
  const { id } = req.params;
  const updates = req.body;
  
  try {
    const updated = await Books.findByIdAndUpdate(id, updates);
    if (!updated) {
      return res.status(404).json({ message: 'Book not found' });
    }
    return res.json({ message: 'Book updated successfully', book: updated });
  } catch (error) {
    console.error('Error updating book:', error);
    return res.status(500).json({ message: 'Error updating book' });
  }
}

// Delete a book
async function deleteBook(req, res) {
  const { id } = req.params;
  try {
    const deleted = await Books.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Book not found' });
    }
    return res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    return res.status(500).json({ message: 'Error deleting book' });
  }
}

// Reset Book (Count or Unlink)
async function resetBook(req, res) {
  const { id } = req.params;
  const { action } = req.body; // 'resetCount' or 'unlink'

  try {
    let book = await Books.findOne({ _id: id });
    if (!book) {
      // Sometimes local json uses direct id matching, sometimes findOne. Let's get all and filter just in case, or just findOne.
      const allBooks = await Books.find({});
      book = allBooks.find(b => b._id === id);
    }
    
    if (!book) return res.status(404).json({ message: 'Book not found' });

    let updates = {};
    if (action === 'resetCount') {
      updates = {
        predictionsUsed: 0,
        remainingPredictions: book.predictionLimit || 20,
        status: book.status === 'Expired' ? 'Active' : book.status
      };
    } else if (action === 'unlink') {
      updates = {
        studentName: '',
        studentEmail: '',
        studentMobile: '',
        status: 'Unused',
        predictionsUsed: 0,
        remainingPredictions: book.predictionLimit || 20,
        activationDate: null,
        lastUsed: null
      };
    } else {
      return res.status(400).json({ message: 'Invalid action specified' });
    }

    const updated = await Books.findByIdAndUpdate(id, updates);
    return res.json({ message: 'Book reset successfully', book: updated });
  } catch (error) {
    console.error('Error resetting book:', error);
    return res.status(500).json({ message: 'Error resetting book' });
  }
}

module.exports = {
  getAllBooks,
  createBook,
  bulkCreateBooks,
  updateBook,
  deleteBook,
  resetBook
};
