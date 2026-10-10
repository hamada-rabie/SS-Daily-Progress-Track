'use strict';

const SSRemediationValidation = (() => {
  const ANSWER_KEYS = Object.freeze({
    'R2-S01':[1,0,2,3,2], 'R2-S02':[0,1,1,2,1],
    'R2-VW01':[1,2,0,1,3], 'R2-WK01':[1,2,0,3,1], 'R2-MD01':[0,1,2,3,1],
    'W2-VW01':[0,1,2,1,3], 'W2-WK01':[1,3,1,2,1], 'W2-MD01':[0,1,2,3,1],
    'L2-VW01':[1,2,0,3,1], 'L2-WK01':[1,2,3,0,1], 'L2-MD01':[0,2,3,1,2],
    'S2-VW01':[1,2,0,3,1], 'S2-WK01':[2,3,0,1,2], 'S2-MD01':[3,0,2,1,3]
  });

  function invalid(message, kind = 'link') {
    const error = new Error(message);
    error.kind = kind;
    throw error;
  }

  function parsePendingPayload(rawValue, roster) {
    const raw = String(rawValue || '');
    if (raw.length > 4096) invalid('Result link too long');
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    const allPayloads = params.getAll('pr');
    if (allPayloads.length !== 1) invalid('Missing or duplicate result payload');
    const encoded = allPayloads[0];
    if (!encoded || encoded.length > 1024) invalid('Invalid result payload length');
    const parts = encoded.split('.');
    if (parts.length !== 7) invalid('Invalid result link format');
    const [setId, studentIdRaw, attemptRaw, claimedScoreRaw, totalRaw, wrongRaw, answersRaw] = parts;
    if (!Object.prototype.hasOwnProperty.call(ANSWER_KEYS, setId)) invalid('Unknown practice set');
    if (!/^\d{1,16}$/.test(studentIdRaw) || !/^[1-2]$/.test(attemptRaw) ||
        !/^[0-5]$/.test(claimedScoreRaw) || totalRaw !== '5') {
      invalid('Invalid student, attempt, score, or total');
    }
    if (!/^(?:[0-3],[0-3],[0-3],[0-3],[0-3])$/.test(answersRaw)) invalid('Invalid answer list');
    const studentId = Number(studentIdRaw);
    const attempt = Number(attemptRaw);
    const claimedScore = Number(claimedScoreRaw);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) invalid('Unsafe student ID');
    const answers = answersRaw.split(',').map(Number);
    const key = ANSWER_KEYS[setId];
    const score = answers.reduce((sum, answer, index) => sum + (answer === key[index] ? 1 : 0), 0);
    const wrong = answers.map((answer, index) => answer === key[index] ? null : index + 1).filter(value => value !== null);
    const claimedWrong = wrongRaw === '' ? [] : wrongRaw.split(',').map(value => /^[1-5]$/.test(value) ? Number(value) : NaN);
    if (claimedWrong.some(value => !Number.isInteger(value)) ||
        score !== claimedScore || JSON.stringify(wrong) !== JSON.stringify(claimedWrong)) {
      invalid('Score or wrong-question list does not match submitted answers');
    }
    if (!Array.isArray(roster)) invalid('Teacher roster is not available', 'roster');
    const matches = roster.filter(student => String(student && student.id) === studentIdRaw);
    if (matches.length !== 1) invalid('Student ID must match exactly one student in the current teacher roster', 'roster');
    return { setId, studentId, attempt, score, total: 5, answers, wrong, student: matches[0] };
  }

  return { ANSWER_KEYS, parsePendingPayload };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SSRemediationValidation;
if (typeof window !== 'undefined') window.SSRemediationValidation = SSRemediationValidation;
