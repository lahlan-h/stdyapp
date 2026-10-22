/*
  Records where a session's breaks fell.

  A break's length is already on the session (pausedSeconds); this adds a
  BREAK interruption type so each finished break also leaves a row saying when
  it ended and how long it was credited - what a finished session's focus chart
  needs to draw it as a break rather than an unexplained gap.

  A NEW value rather than reusing MANUAL: clients may post MANUAL themselves,
  and it counts as time away. BREAK is written only by the server and is left
  out of every away total.
*/

-- AlterEnum
ALTER TYPE "InterruptionType" ADD VALUE 'BREAK';
