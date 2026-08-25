import Homepage from "../PatternLibrary/Homepage";
import Legal from "../PatternLibrary/Legal";
import PatternLibrary from "../PatternLibrary";
import StyleGuide from "../StyleGuide";

function App() {
  switch (window.location.pathname) {
    case "/patterns/homepage":
      return <Homepage />;
    case "/patterns/legal":
      return <Legal />;
    case "/style-guide":
      return <StyleGuide />;
    default:
      return <PatternLibrary />;
  }
}

export default App;
