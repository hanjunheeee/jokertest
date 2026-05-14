export default function LoginPage() {
  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <img
        src={encodeURI("/로그인.png")}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        decoding="async"
      />
    </div>
  )
}
