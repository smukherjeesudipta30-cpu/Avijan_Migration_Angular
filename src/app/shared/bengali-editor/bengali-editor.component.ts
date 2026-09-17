import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import {
  BENGALI_PALETTE,
  convertWordAtCaret,
  toBengali
} from '../../core/text/bengali-transliterate';

/**
 * A box the office can type Bengali into from an ordinary English keyboard.
 *
 * <p>Stands in for a plain textarea wherever a Bengali field is edited. With phonetic
 * typing switched on, each word is converted as it is finished, so "protizOgita" becomes
 * প্রতিযোগিতা; switched off, the box behaves exactly like the textarea it replaced, which
 * is what someone pasting from elsewhere or using a real Bengali keyboard wants.</p>
 *
 * <p>Conversion happens only to the run of Roman letters immediately before the caret.
 * Text already in the box — pasted Bengali, or a line typed a minute ago — is never
 * re-read, because converting it a second time would destroy it.</p>
 */
@Component({
  selector: 'app-bengali-editor',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BengaliEditorComponent),
      multi: true
    }
  ],
  templateUrl: './bengali-editor.component.html',
  styleUrl: './bengali-editor.component.scss'
})
export class BengaliEditorComponent implements ControlValueAccessor {
  @Input() rows = 3;
  @Input() maxlength: number | null = null;
  @Input() placeholder = '';

  @ViewChild('box') box?: ElementRef<HTMLTextAreaElement>;

  readonly value = signal('');
  readonly phonetic = signal(true);
  readonly paletteOpen = signal(false);

  /** What the half-typed word would become, shown under the box while it is typed. */
  readonly preview = signal('');

  readonly palette = BENGALI_PALETTE;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  /* ------------------------------------------------- ControlValueAccessor */

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /* ------------------------------------------------------------- typing */

  input(event: Event): void {
    const box = event.target as HTMLTextAreaElement;
    this.value.set(box.value);
    this.publish(box.value);
    this.showPreview(box);
  }

  /**
   * Converts the finished word.
   *
   * <p>On the key that ends a word rather than on every keystroke: converting mid-word
   * would settle on ক the moment "k" is typed and never let it become খ.</p>
   */
  keydown(event: KeyboardEvent): void {
    if (!this.phonetic()) return;

    const ends = event.key === ' ' || event.key === 'Enter' || event.key === 'Tab'
      || event.key === ',' || event.key === '।';

    if (!ends) return;

    const box = event.target as HTMLTextAreaElement;
    const caret = box.selectionStart ?? box.value.length;

    const converted = convertWordAtCaret(box.value, caret);
    if (converted.text === box.value) return;

    box.value = converted.text;
    box.setSelectionRange(converted.caret, converted.caret);

    this.value.set(converted.text);
    this.publish(converted.text);
    this.preview.set('');
  }

  blur(event: FocusEvent): void {
    this.onTouched();
    if (!this.phonetic()) return;

    /* The last word of a line is never followed by a space, so it would otherwise be
       left in Roman letters when the field is saved. */
    const box = event.target as HTMLTextAreaElement;
    const converted = convertWordAtCaret(box.value, box.selectionStart ?? box.value.length);

    if (converted.text !== box.value) {
      box.value = converted.text;
      this.value.set(converted.text);
      this.publish(converted.text);
    }

    this.preview.set('');
  }

  togglePhonetic(): void {
    this.phonetic.set(!this.phonetic());
    this.preview.set('');
    this.box?.nativeElement.focus();
  }

  /** Drops a character straight in, for anything the phonetics cannot reach. */
  insert(glyph: string): void {
    const box = this.box?.nativeElement;
    if (!box) return;

    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? start;

    const next = box.value.slice(0, start) + glyph + box.value.slice(end);

    box.value = next;
    box.setSelectionRange(start + glyph.length, start + glyph.length);
    box.focus();

    this.value.set(next);
    this.publish(next);
  }

  private showPreview(box: HTMLTextAreaElement): void {
    if (!this.phonetic()) {
      this.preview.set('');
      return;
    }

    const caret = box.selectionStart ?? box.value.length;
    const word = /[A-Za-z0-9^:,$.]*$/.exec(box.value.slice(0, caret))?.[0] ?? '';

    this.preview.set(word ? toBengali(word) : '');
  }

  private publish(value: string): void {
    this.onChange(value.length ? value : null);
  }
}
