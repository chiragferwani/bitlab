import { substituteSysdate, transformDateArithmetic } from './src/lib/sqlEngine.js';

console.log('Testing SYSDATE substitution:');
const sql1 = "INSERT INTO Borrower VALUES (1, 'Amit', SYSDATE-20, 'I');";
console.log('Original:', sql1);
console.log('Transformed:', substituteSysdate(sql1));

const sql2 = "SELECT SYSDATE - DateofIssue INTO v_days FROM Borrower;";
console.log('Original:', sql2);
console.log('Transformed:', transformDateArithmetic(sql2));
