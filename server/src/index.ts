import app from './app';
import dotenv from "dotenv";

const PORT = process.env.PORT ?? 3000;

dotenv.config();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
