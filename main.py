from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label

class Root(BoxLayout):
    def __init__(self, **kwargs):
        super().__init__(orientation="vertical", padding=20, spacing=20, **kwargs)
        self.count = 0
        self.lbl = Label(text="0", font_size=64)
        self.btn = Button(text="TAP", font_size=48, size_hint=(1, 0.6))
        self.btn.bind(on_press=self.tap)
        self.add_widget(self.lbl)
        self.add_widget(self.btn)

    def tap(self, *_):
        self.count += 1
        self.lbl.text = str(self.count)

class ClickerApp(App):
    def build(self):
        return Root()

if __name__ == "__main__":
    ClickerApp().run()