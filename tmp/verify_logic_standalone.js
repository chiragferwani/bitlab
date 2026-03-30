function substituteSysdate(sql) {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  let result = sql.replace(/SYSDATE\s*-\s*(\d+)/gi, (_, n) => {
    const d = new Date(now)
    d.setDate(d.getDate() - parseInt(n))
    return `'${d.toISOString().split('T')[0]}'`
  })
  result = result.replace(/SYSDATE\s*\+\s*(\d+)/gi, (_, n) => {
    const d = new Date(now)
    d.setDate(d.getDate() + parseInt(n))
    return `'${d.toISOString().split('T')[0]}'`
  })
  result = result.replace(/\bSYSDATE\b/gi, `'${dateStr}'`)
  return result
}

function transformDateArithmetic(sql) {
  let result = sql.replace(
    /SYSDATE\s*-\s*([A-Za-z_][A-Za-z0-9_]*)/gi,
    (_, col) => `CAST(julianday('now') - julianday(${col}) AS INTEGER)`
  )
  result = result.replace(
    /([A-Za-z_][A-Za-z0-9_]*)\s*-\s*SYSDATE/gi,
    (_, col) => `CAST(julianday(${col}) - julianday('now') AS INTEGER)`
  )
  return result
}

console.log('Testing SYSDATE substitution:');
const sql1 = "INSERT INTO Borrower VALUES (1, 'Amit', SYSDATE-20, 'I');";
console.log('Original:', sql1);
console.log('Transformed:', substituteSysdate(sql1));

const sql2 = "SELECT SYSDATE - DateofIssue INTO v_days FROM Borrower;";
console.log('Original:', sql2);
console.log('Transformed:', transformDateArithmetic(sql2));
