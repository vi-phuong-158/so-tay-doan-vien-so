import { assert, assertEquals, assertStringIncludes, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { escapeHtml, renderQueueEmail, sanitizeSubject, TemplateError } from './renderer.ts';

const baseRow = {
  id: 'p303-test-queue',
  template_code: 'SYSTEM_EMAIL_TEST',
  recipient_email: 'test@example.com',
  recipient_name: 'Nguyễn <Test>',
  payload: {
    title: 'Kiểm thử & xác nhận',
    message: '<script>alert(1)</script> & an toàn',
    action_path: '/ca-nhan/thong-bao'
  }
};

Deno.test('renderer escapes HTML while preserving harmless text version', () => {
  const email = renderQueueEmail(baseRow, 'https://app.example');
  assertStringIncludes(email.html, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assertStringIncludes(email.html, 'Nguyễn &lt;Test&gt;');
  assert(!email.html.includes('<script>'));
  assertStringIncludes(email.text, '<script>alert(1)</script>');
  assertStringIncludes(email.html, 'https://app.example/ca-nhan/thong-bao');
});

Deno.test('renderer rejects external action URLs and unknown templates', () => {
  assertThrows(
    () => renderQueueEmail({ ...baseRow, payload: { ...baseRow.payload, action_path: 'https://evil.example' } }, 'https://app.example'),
    TemplateError,
    'TEMPLATE_ACTION_URL_INVALID'
  );
  assertThrows(
    () => renderQueueEmail({ ...baseRow, template_code: 'UNKNOWN_TEMPLATE' }, 'https://app.example'),
    TemplateError,
    'TEMPLATE_NOT_ALLOWLISTED'
  );
});

Deno.test('subject strips CRLF and header-like fields and stays bounded', () => {
  const subject = sanitizeSubject('Hello\r\nBcc: attacker@example.com\nCc: other@example.com');
  assertEquals(subject, 'Hello attacker@example.com other@example.com');
  assert(subject.length <= 150);
});

Deno.test('HTML escape covers all required special characters', () => {
  assertEquals(escapeHtml(`& < > " '`), '&amp; &lt; &gt; &quot; &#39;');
});

Deno.test('report event templates are allowlisted and escape bounded review reasons', () => {
  const email = renderQueueEmail({
    ...baseRow,
    template_code: 'REPORT_NEEDS_SUPPLEMENT',
    payload: {
      campaign_title: 'Báo cáo <quý>',
      unit_name: 'Chi đoàn A',
      review_reason: '<script>alert(1)</script>',
      action_path: '/cong-viec/bao-cao/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    }
  }, 'https://app.example');

  assertStringIncludes(email.subject, 'Báo cáo');
  assertStringIncludes(email.html, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert(!email.html.includes('<script>'));
  assertStringIncludes(email.html, 'https://app.example/cong-viec/bao-cao/');
});

Deno.test('report event templates reject missing bounded payload fields', () => {
  assertThrows(
    () => renderQueueEmail({
      ...baseRow,
      template_code: 'REPORT_ACCEPTED',
      payload: { action_path: '/cong-viec/bao-cao/assignment' }
    }, 'https://app.example'),
    TemplateError,
    'TEMPLATE_PAYLOAD_INVALID'
  );
});
