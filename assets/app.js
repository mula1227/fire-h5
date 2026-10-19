window.initFirePage = () => {
(() => {
  const category = document.querySelector('#id_category');
  if (!category) return;
  const labels = {
    org: ['单位名称', '单位基本情况简介'],
    individual: ['姓名', '从事行业'],
    volunteer: ['姓名', '志愿服务基本情况／从事行业'],
    student: ['学生姓名', '学校与班级']
  };
  const show = (name, visible) => {
    const field = document.querySelector('[data-field="' + name + '"]');
    if (field) field.hidden = !visible;
  };
  const update = () => {
    const student = category.value === 'student';
    show('guardian_name', student);
    show('guardian_consent', student);
    ['guardian_name','guardian_consent'].forEach(name => {
      const input = document.getElementById('id_' + name);
      if (input) input.required = student;
    });
    show('organization_code', category.value === 'volunteer');
    const current = labels[category.value];
    if (!current) return;
    ['name', 'introduction'].forEach((name, i) => {
      const label = document.querySelector('label[for="id_' + name + '"]');
      if (label) label.textContent = current[i] + ' *';
      const input = document.getElementById('id_' + name);
      if (input) input.placeholder = name === 'name' ? (category.value === 'org' ? '请输入单位全称' : '请输入真实姓名') : '请简要填写' + current[i];
    });
  };
  category.addEventListener('change', update);
  update();
})();

// Preview files locally; the original file inputs remain responsible for submission.
(() => {
  document.querySelectorAll('.upload-control input[type="file"]').forEach(input => {
    let selectionVersion = 0;
    input.addEventListener('change', () => {
      const version = ++selectionVersion;
      const control = input.closest('.upload-control');
      const preview = control.querySelector('.upload-preview');
      const summary = control.parentElement.querySelector('.upload-summary');
      const files = Array.from(input.files || []);
      preview.replaceChildren();
      control.classList.toggle('has-files', files.length > 0);
      summary.textContent = files.length ? '已选择 ' + files.length + ' 张：' + files.map(file => file.name).join('、') + '。点击可重新选择。' : '尚未选择照片';
      files.slice(0, 6).forEach(file => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
          summary.textContent = '请选择 JPG、PNG 或 WebP 图片，单张不超过 8MB。';
          return;
        }
        const image = document.createElement('img');
        image.alt = '';
        preview.append(image);
        const reader = new FileReader();
        reader.addEventListener('load', () => { if (selectionVersion === version) image.src = reader.result; });
        reader.readAsDataURL(file);
      });
    });
  });
})();

// Avoid duplicate clicks while preserving native validation and all form data.
(() => {
  const reset = () => document.querySelectorAll('form[data-submitting]').forEach(form => {
    delete form.dataset.submitting;
    form.removeAttribute('aria-busy');
    form.querySelectorAll('button[data-original-label]').forEach(button => {
      button.disabled = false;
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    });
  });
  if (!window.firePageshowBound) {
    window.addEventListener('pageshow', reset);
    window.firePageshowBound = true;
  }
  document.querySelectorAll('form[method="post"]').forEach(form => {
    // Downloads keep the document open and must remain usable afterward.
    if (location.pathname === '/staff/export/') return;
    form.addEventListener('submit', event => {
      if (form.dataset.submitting) { event.preventDefault(); return; }
      form.dataset.submitting = 'true';
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('button[type="submit"],button:not([type])').forEach(button => {
        button.dataset.originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = '正在提交…';
      });
    });
  });
})();
};
window.initFirePage();
