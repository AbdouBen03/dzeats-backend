import bcrypt from "bcrypt";

bcrypt.hash("123456", 10).then((hash) => {
  console.log("Hashed password:", hash);
});