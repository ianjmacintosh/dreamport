import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/")({
  component: Home,
});

function Home() {
  return (
    <>
      <h1>Dreamport</h1>
      <h2>Your ideas, ready to build</h2>

      <p>We all have product ideas.</p>
      <p>
        Sometimes they arrive in a brilliant flash, blinding us and stealing our
        attention, letting our imagination run wild with what they could be.
      </p>
      <p>
        Sometimes they begin as little fragile things full of uncertainty, and
        we keep them safely tucked away, only occasionally allowing ourselves to
        wonder about what would happen if we built it.
      </p>
      <p>
        And sometimes an idea arrives nothing like either of those: it shows up
        unannounced, without any fanfare or pretentiousness, we make a note of
        it (or not), and we move on.
      </p>
      <p>
        Dreamport is where you can put those ideas and grow them however you
        want and whenever you'd like.
      </p>
      <p>
        Dreamport gives you a lightweight and effortless way to record your
        ideas. You can refine them with as much or as little structure as works
        best for you. You can go completely free-form and cut your own path, you
        can use pre-loaded tools we provide to figure details out on your own
        when you have time, or you can follow proven product strategy
        methodologies with guard rails to keep you on track.
      </p>

      <p>
        It doesn't matter how you build it, all that matters is that you start.
      </p>
      <p>
        Bookmark this page and check back soon. I can't wait to help you build.
      </p>
    </>
  );
}
